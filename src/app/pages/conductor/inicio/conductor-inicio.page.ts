import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter, ViewDidLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService, ErrorApi } from '../../../core/api.service';
import { SesionService } from '../../../core/sesion.service';
import { ConductorRegistroService } from '../../../servicios/conductor-registro.service';
import { UbicacionService } from '../../../servicios/ubicacion.service';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa, ZonaDemanda } from '../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { BarraInferiorComponent, ItemBarra } from '../../../componentes/barra-inferior/barra-inferior.component';
import { TiempoEnLinea } from './tiempo-en-linea';

/** GET /api/conductor/mi-perfil (solo los campos que usa esta pantalla). */
interface MiPerfil {
  disponible: boolean;
  calificacion_promedio: number | null;
}

/** GET /api/transporte/stats-conductor/{id} */
interface ResumenHoy {
  viajes_hoy: number;
  ganancias_hoy: number;
}

/** GET /api/servicios/disponibles (el backend devuelve servicio_id, no id). */
interface SolicitudDisponible {
  servicio_id: number;
}

export const BARRA_CONDUCTOR: ItemBarra[] = [
  { texto: 'Inicio', icono: 'casa', ruta: '/conductor/inicio' },
  { texto: 'Mis viajes', icono: 'lista', ruta: '/conductor/viajes' },
  { texto: 'Ganancias', icono: 'dinero', ruta: '/conductor/ganancias' },
  { texto: 'Perfil', icono: 'persona', ruta: '/conductor/perfil' },
];

/** Meta diaria que se muestra en la barra de progreso (todavía no existe en el backend). */
const META_DIA = 80000;
/** Cada cuánto se reporta la ubicación y se preguntan solicitudes nuevas mientras está en línea. */
const CADA_MS = 8000;

/** $48.500 (sin el espacio que pone Intl con style 'currency'). */
const miles = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const pesos = { format: (n: number) => '$' + miles.format(n) };

/**
 * Conductor app 1 · Inicio.
 * Interruptor "en línea" (POST /api/conductor/disponibilidad con el GPS), mapa Leaflet con su posición y las
 * zonas con más pedidos (GET /api/conductor/zonas-demanda), lo ganado hoy contra la meta, viajes, horas en línea
 * y calificación. Mientras está en línea reporta su ubicación (POST /api/conductor/ubicacion) para que el backend
 * le asigne viajes cercanos, y si llega una solicitud abre "Nueva solicitud" (Conductor app 2).
 */
@Component({
  selector: 'app-conductor-inicio',
  templateUrl: 'conductor-inicio.page.html',
  styleUrls: ['conductor-inicio.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent, BarraInferiorComponent],
})
export class ConductorInicioPage implements ViewDidEnter, ViewDidLeave {
  private readonly nav = inject(NavController);
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly registro = inject(ConductorRegistroService);
  private readonly gps = inject(UbicacionService);
  private readonly reloj = new TiempoEnLinea();
  private sondeo: ReturnType<typeof setInterval> | null = null;

  readonly barra = BARRA_CONDUCTOR;

  readonly nombre = computed(() => {
    const d = this.sesion.datos();
    return (d?.nombres || d?.nombre || '').trim().split(/\s+/)[0] || 'conductor';
  });
  readonly iniciales = computed(() => {
    const d = this.sesion.datos();
    const n = (d?.nombres || d?.nombre || '').trim();
    const a = (d?.apellidos || n.split(/\s+/)[1] || '').trim();
    return ((n.charAt(0) || 'C') + a.charAt(0)).toUpperCase();
  });
  readonly foto = computed(() => this.sesion.datos()?.foto ?? null);
  readonly vehiculo = computed(() => this.registro.tipo() ?? 'moto');
  readonly miPunto = computed<PuntoMapa | null>(() => {
    const u = this.gps.ubicacion();
    return u ? { lat: u.lat, lng: u.lng } : null;
  });

  readonly precision = computed(() => this.gps.ubicacion()?.precision ?? null);

  readonly enLinea = signal(false);
  readonly cambiando = signal(false);
  readonly aviso = signal('');
  readonly zonas = signal<ZonaDemanda[]>([]);

  readonly ganado = signal(0);
  readonly viajes = signal(0);
  readonly calificacion = signal<number | null>(null);
  readonly minutos = signal(this.reloj.minutosHoy());

  readonly ganadoTexto = computed(() => pesos.format(this.ganado()));
  readonly metaTexto = pesos.format(META_DIA);
  readonly avance = computed(() => Math.min(1, this.ganado() / META_DIA));
  readonly porcentaje = computed(() => Math.round(this.avance() * 100));
  readonly falta = computed(() => {
    const f = META_DIA - this.ganado();
    return f > 0 ? `Te faltan ${pesos.format(f)} para tu meta` : '¡Cumpliste tu meta de hoy!';
  });
  readonly horasTexto = computed(() => {
    const m = this.minutos();
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 >= 30 ? ' ½' : ''}`;
  });
  readonly calificacionTexto = computed(() => {
    const c = this.calificacion();
    return c ? c.toFixed(1).replace('.', ',') : '—';
  });

  ionViewDidEnter(): void {
    this.gps.seguir(); // su vehículo se mueve en el mapa en tiempo real
    this.cargar();
    if (!this.registro.tipo()) this.registro.cargar().catch(() => undefined);
  }

  ionViewDidLeave(): void {
    this.gps.dejarDeSeguir();
    this.detenerSondeo();
  }

  async alternar(): Promise<void> {
    if (this.cambiando()) return;
    const activo = !this.enLinea();
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
    this.cambiando.set(true);
    this.aviso.set('');
    try {
      if (activo) await this.gps.actualizar();
      const pos = activo ? this.miPunto() : null;
      await this.api.post('/conductor/disponibilidad', { activo, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
      this.aplicarEstado(activo);
      if (activo && !pos) this.aviso.set('Activa la ubicación para que te lleguen viajes cerca de ti.');
    } catch (e) {
      this.aviso.set((e as ErrorApi).message);
    } finally {
      this.cambiando.set(false);
    }
  }

  notificaciones(): void {
    this.nav.navigateForward('/conductor/notificaciones');
  }

  private async cargar(): Promise<void> {
    const id = this.sesion.datos()?.id;
    const [perfil, hoy, zonas] = await Promise.allSettled([
      this.api.get<MiPerfil>('/conductor/mi-perfil'),
      id ? this.api.get<ResumenHoy>(`/transporte/stats-conductor/${id}`) : Promise.reject(),
      this.api.get<ZonaDemanda[]>('/conductor/zonas-demanda'),
    ]);
    if (perfil.status === 'fulfilled') {
      this.calificacion.set(perfil.value.calificacion_promedio ? Number(perfil.value.calificacion_promedio) : null);
      this.aplicarEstado(!!perfil.value.disponible);
    } else {
      this.aviso.set('No pudimos conectar con MoviFY. Revisa tu internet.');
    }
    if (hoy.status === 'fulfilled') {
      this.ganado.set(Number(hoy.value.ganancias_hoy) || 0);
      this.viajes.set(Number(hoy.value.viajes_hoy) || 0);
    }
    if (zonas.status === 'fulfilled') {
      // PostgreSQL devuelve numeric: llegan como texto o número según el driver
      this.zonas.set(zonas.value.map((z) => ({ lat: Number(z.lat), lng: Number(z.lng), pedidos: Number(z.pedidos) })));
    }
  }

  private aplicarEstado(activo: boolean): void {
    this.enLinea.set(activo);
    if (activo) {
      this.reloj.conectar();
      this.iniciarSondeo();
    } else {
      this.reloj.desconectar();
      this.detenerSondeo();
    }
    this.minutos.set(this.reloj.minutosHoy());
  }

  /** Mientras está en línea: reporta dónde está y busca solicitudes nuevas. */
  private iniciarSondeo(): void {
    if (this.sondeo) return;
    const revisar = async () => {
      this.minutos.set(this.reloj.minutosHoy());
      try {
        const pos = this.miPunto(); // la mantiene al día gps.seguir()
        if (pos) await this.api.post('/conductor/ubicacion', pos);
        const lista = await this.api.get<SolicitudDisponible[]>('/servicios/disponibles');
        if (lista.length && this.enLinea()) {
          this.detenerSondeo();
          Haptics.vibrate({ duration: 400 }).catch(() => undefined);
          this.nav.navigateForward('/conductor/viaje/solicitud', { queryParams: { id: lista[0].servicio_id } });
        }
      } catch {
        /* sin señal: se vuelve a intentar en la próxima vuelta */
      }
    };
    revisar();
    this.sondeo = setInterval(revisar, CADA_MS);
  }

  private detenerSondeo(): void {
    if (this.sondeo) clearInterval(this.sondeo);
    this.sondeo = null;
  }
}
