import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { TiempoRealService } from '../core/tiempo-real.service';
import { Punto, PosicionEnRuta, RutaMedida, recorridoEn } from '../componentes/mapa-ciudad/animar-por-ruta';

/** Cada cuánto se vuelve a leer el estado del backend (la posición entre lecturas se calcula aquí). */
const SONDEO_MS = 2000;
/** Lo que tarda en desaparecer una corrección (si el reloj local se adelantó o atrasó un poco). */
const SUAVIZAR_MS = 700;
/** Diferencias mayores no se suavizan (reinicio, finalizar, ruta nueva): se salta. */
const SALTO_M = 60;

export type FaseSimulacion = 'recogida' | 'destino';
export type EstadoSimulacionCodigo = 'lista' | 'corriendo' | 'pausada' | 'llego';
export type AccionSimulacion = 'iniciar' | 'pausar' | 'reanudar' | 'reiniciar' | 'finalizar';

/** GET /api/servicios/{id}/simulacion */
export interface EstadoSimulacion {
  servicio_id: number;
  fase: FaseSimulacion;
  estado: EstadoSimulacionCodigo;
  version: number;
  distancia_m: number;
  recorrido_m: number;
  restante_m: number;
  eta_s: number;
  velocidad_kmh: number;
  progreso: number;
  lat: number;
  lng: number;
  rumbo: number;
  servidor_ms: number;
  /** [[lat, lng], …] solo cuando la app tiene otra versión de la ruta. */
  ruta?: [number, number][];
}

/** Lo que el mapa necesita para mover el vehículo cuadro a cuadro. */
export interface RecorridoSimulado {
  readonly version: number;
  readonly ruta: RutaMedida;
  posicion(ahora: number): PosicionEnRuta;
}

/**
 * Viaje simulado de un servicio, visto desde la app (conductor o cliente).
 *
 * La fuente de verdad es el backend (tabla simulacion_viajes). Cada 2 s se lee el estado y, entre lecturas,
 * la posición se calcula aquí con la MISMA fórmula (metros = marca + velocidad × tiempo, sobre la misma
 * polilínea): el conductor y el pasajero ven el vehículo en el mismo punto y moviéndose a 60 fps.
 * Si la lectura nueva no cuadra exacto con lo que se veía, la diferencia se suaviza (no salta).
 *
 * Una instancia por pantalla: `providers: [SimulacionViajeService]`.
 */
@Injectable()
export class SimulacionViajeService implements OnDestroy {
  private readonly api = inject(ApiService);

  readonly estado = signal<EstadoSimulacion | null>(null);
  readonly recorrido = signal<RecorridoSimulado | null>(null);
  readonly ocupado = signal(false);
  readonly error = signal('');

  readonly activa = computed(() => this.estado() !== null);
  readonly ruta = computed<Punto[]>(() => this.recorrido()?.ruta.puntos ?? []);
  readonly minutos = computed(() => {
    const e = this.estado();
    return e ? Math.max(e.restante_m > 0 ? 1 : 0, Math.ceil(e.eta_s / 60)) : null;
  });
  readonly restanteKm = computed(() => (this.estado() ? this.estado()!.restante_m / 1000 : null));

  private id = 0;
  private sondeo: ReturnType<typeof setInterval> | null = null;
  private readonly tiempoReal = inject(TiempoRealService);
  private dejarDeSeguir: () => void = () => undefined;
  private medida: RutaMedida | null = null;
  private version = 0;
  /** Base para calcular la posición: lo que dijo el backend y cuándo llegó (reloj local). */
  private base = { recorrido: 0, recibido: 0, estado: 'lista' as string, velocidad: 0 };
  private correccion = 0;
  private correccionEn = 0;

  /** Empieza a seguir la simulación del servicio (si no hay, `estado()` queda en null). */
  seguir(id: number): void {
    if (this.id === id && this.sondeo) return;
    this.detener();
    this.id = id;
    this.leer();
    this.sondeo = setInterval(() => this.leer(), SONDEO_MS);
    // Pausa, velocidad, "llegar ya" o ruta nueva: el backend avisa por WebSocket y se lee al instante
    this.dejarDeSeguir = this.tiempoReal.seguir(id, (e) => {
      if (e.tipo === 'simulacion' || e.tipo === 'estado') this.leer();
    });
  }

  detener(): void {
    if (this.sondeo) clearInterval(this.sondeo);
    this.sondeo = null;
    this.dejarDeSeguir();
    this.dejarDeSeguir = () => undefined;
  }

  ngOnDestroy(): void {
    this.detener();
  }

  /** ¿La simulación va en esta fase? (recogida antes de recoger, destino después). */
  enFase(fase: FaseSimulacion): boolean {
    return this.estado()?.fase === fase;
  }

  // ───────────── Controles (solo el conductor) ─────────────

  accion(a: AccionSimulacion): Promise<void> {
    return this.mandar(a, null);
  }

  velocidad(kmh: number): Promise<void> {
    return this.mandar('velocidad', { velocidad_kmh: kmh });
  }

  private async mandar(accion: string, cuerpo: unknown): Promise<void> {
    if (!this.id || this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      const r = await this.api.post<EstadoSimulacion>(`/servicios/${this.id}/simulacion/${accion}`, cuerpo ?? {});
      this.aplicar(r, performance.now());
    } catch (e) {
      this.error.set((e as { message?: string }).message || 'No se pudo cambiar la simulación');
    } finally {
      this.ocupado.set(false);
    }
  }

  // ───────────── Lectura y cálculo ─────────────

  private async leer(): Promise<void> {
    const id = this.id;
    try {
      const v = this.medida ? `?version=${this.version}` : '';
      const r = await this.api.get<EstadoSimulacion | null>(`/servicios/${id}/simulacion${v}`);
      if (id !== this.id) return;
      if (!r) {
        this.estado.set(null);
        this.recorrido.set(null);
        this.medida = null;
        return;
      }
      this.aplicar(r, performance.now());
    } catch {
      // Sin conexión: el vehículo sigue avanzando con lo último que se sabía
    }
  }

  /** Recibe un estado del backend y deja lista la base para calcular posiciones. */
  aplicar(r: EstadoSimulacion, ahora: number): void {
    const cambioRuta = !this.medida || r.version !== this.version;
    if (cambioRuta && !r.ruta) {
      // Llegó una versión nueva sin la geometría: se pide completa en la próxima lectura
      this.medida = null;
      return;
    }
    const antes = !cambioRuta && this.recorrido() ? this.calcular(ahora) : null;
    if (cambioRuta) {
      this.medida = new RutaMedida(r.ruta!.map(([lat, lng]) => ({ lat, lng })));
      this.version = r.version;
    }
    this.base = { recorrido: r.recorrido_m, recibido: ahora, estado: r.estado, velocidad: r.velocidad_kmh };
    // Corrección suave: si se veía un poco más adelante o atrás, se acerca al valor nuevo en ~0,7 s
    const dif = antes === null ? 0 : antes - r.recorrido_m;
    this.correccion = Math.abs(dif) < SALTO_M ? dif : 0;
    this.correccionEn = ahora;
    this.estado.set(r);
    if (cambioRuta) {
      const medida = this.medida!;
      const version = this.version;
      this.recorrido.set({ version, ruta: medida, posicion: (t: number) => medida.en(this.calcular(t)) });
    }
  }

  /** Metros recorridos en el instante t (reloj local, performance.now()). */
  private calcular(t: number): number {
    const m = this.medida;
    if (!m) return 0;
    const s = recorridoEn(this.base.estado, this.base.recorrido, this.base.recibido, this.base.velocidad, m.largo, t);
    const c = this.correccion * Math.exp(-(t - this.correccionEn) / SUAVIZAR_MS);
    return Math.max(0, Math.min(m.largo, s + (Math.abs(c) < 0.05 ? 0 : c)));
  }
}
