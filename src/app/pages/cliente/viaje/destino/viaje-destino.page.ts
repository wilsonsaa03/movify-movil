import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService } from '../../../../core/api.service';
import { IconoComponent, NombreIcono } from '../../../../componentes/icono/icono.component';
import { NotaVozComponent, formatear } from '../../../../componentes/nota-voz/nota-voz.component';
import { Grabadora, MAX_SEGUNDOS_NOTA } from '../../../../servicios/grabadora';
import { Lugar, LugaresService } from '../../../../servicios/lugares.service';
import { UbicacionService } from '../../../../servicios/ubicacion.service';
import { TipoVehiculo, ViajeService } from '../../../../servicios/viaje.service';

/** Fila de GET /api/usuarios/direcciones. */
interface Direccion {
  id: number;
  etiqueta: string;
  direccion: string;
  barrio: string | null;
  lat: number | null;
  lng: number | null;
}

interface Opcion {
  lugar: Lugar;
  icono: NombreIcono;
  tono: 'naranja' | 'gris' | 'amarillo';
  /** "guardado" o "reciente" (se muestra junto al detalle). */
  marca?: string;
}

/** Espera tras la última tecla antes de buscar (Nominatim pide máximo 1 consulta por segundo). */
const ESPERA_BUSQUEDA_MS = 450;

/**
 * Viaje 2 · ¿A dónde vas?
 * DESDE = ubicación real del GPS (barrio y dirección). HASTA = buscador de direcciones en Buenaventura,
 * con sus lugares guardados y los destinos recientes cuando todavía no escribe nada.
 * Punto de referencia en texto y/o nota de voz (hasta 30 s). "Confirmar destino" → Viaje 3.
 */
@Component({
  selector: 'app-viaje-destino',
  templateUrl: 'viaje-destino.page.html',
  styleUrls: ['viaje-destino.page.scss'],
  imports: [IonContent, IonFooter, FormsModule, IconoComponent, NotaVozComponent],
})
export class ViajeDestinoPage implements ViewDidEnter, ViewWillLeave, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly gps = inject(UbicacionService);
  private readonly lugares = inject(LugaresService);
  readonly viaje = inject(ViajeService);

  readonly texto = signal(this.viaje.destino()?.nombre ?? '');
  readonly buscando = signal(false);
  readonly resultados = signal<Lugar[]>([]);
  readonly errorBusqueda = signal('');
  readonly guardados = signal<Opcion[]>([]);
  readonly menuTipo = signal(false);

  readonly grabando = signal(false);
  readonly segundosGrabados = signal(0);
  readonly errorNota = signal('');
  readonly maxNota = MAX_SEGUNDOS_NOTA;
  readonly tiempoGrabado = computed(() => formatear(this.segundosGrabados()));

  private temporizador?: ReturnType<typeof setTimeout>;
  private consulta?: AbortController;
  private grabadora?: Grabadora;
  private reloj?: ReturnType<typeof setInterval>;

  /** DESDE: la posición del GPS con su dirección. */
  readonly origenTexto = computed(() => {
    const u = this.gps.ubicacion();
    if (!u) return this.gps.estado() === 'sin-permiso' ? 'Activa tu ubicación' : 'Buscando tu ubicación…';
    const donde = u.direccion ?? u.barrio ?? u.ciudad;
    return donde ? `Mi ubicación · ${donde}` : 'Mi ubicación';
  });

  /** Lo que se muestra debajo del buscador. */
  readonly opciones = computed<Opcion[]>(() => {
    // Mientras haya resultados de la búsqueda se siguen mostrando (con el elegido resaltado)
    if (this.texto().trim().length >= 3 && this.resultados().length) {
      return this.resultados().map((lugar) => ({ lugar, icono: 'pin', tono: 'gris' }));
    }
    return this.guardados();
  });

  readonly puedeConfirmar = computed(() => !!this.viaje.destino() && !!this.gps.ubicacion() && !this.grabando());

  constructor() {
    const tipo = this.ruta.snapshot.queryParamMap.get('tipo');
    if (tipo === 'moto' || tipo === 'taxi') this.viaje.tipo.set(tipo);
  }

  ionViewDidEnter(): void {
    this.gps.seguir();
    this.cargarGuardados();
  }

  ionViewWillLeave(): void {
    this.gps.dejarDeSeguir();
    if (this.grabando()) this.cancelarGrabacion();
  }

  ngOnDestroy(): void {
    clearTimeout(this.temporizador);
    this.consulta?.abort();
    this.cancelarGrabacion();
  }

  volver(): void {
    this.nav.back();
  }

  elegirTipo(t: TipoVehiculo): void {
    this.viaje.tipo.set(t);
    this.menuTipo.set(false);
  }

  reintentarGps(): void {
    this.gps.actualizar();
  }

  // ---------- Buscador ----------

  escribir(valor: string): void {
    this.texto.set(valor);
    // Si cambia lo escrito, el destino elegido deja de valer
    if (this.viaje.destino() && valor !== this.viaje.destino()!.nombre) this.viaje.destino.set(null);
    clearTimeout(this.temporizador);
    this.consulta?.abort();
    this.errorBusqueda.set('');
    if (valor.trim().length < 3) {
      this.resultados.set([]);
      this.buscando.set(false);
      return;
    }
    this.buscando.set(true);
    this.temporizador = setTimeout(() => this.buscar(valor), ESPERA_BUSQUEDA_MS);
  }

  limpiar(): void {
    this.escribir('');
  }

  elegir(o: Opcion): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.viaje.destino.set(o.lugar);
    this.texto.set(o.lugar.nombre);
    clearTimeout(this.temporizador); // si había una búsqueda pendiente, ya no hace falta
    this.buscando.set(false);
  }

  esElegido(o: Opcion): boolean {
    const d = this.viaje.destino();
    return !!d && d.lat === o.lugar.lat && d.lng === o.lugar.lng;
  }

  // ---------- Nota de voz ----------

  async grabar(): Promise<void> {
    this.errorNota.set('');
    this.grabadora = new Grabadora();
    this.grabadora.alTerminarSola = (n) => this.guardarNota(n);
    try {
      await this.grabadora.empezar();
    } catch (e) {
      this.errorNota.set((e as Error).message);
      return;
    }
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
    this.grabando.set(true);
    this.segundosGrabados.set(0);
    this.reloj = setInterval(() => this.segundosGrabados.set(Math.floor(this.grabadora?.segundos() ?? 0)), 250);
  }

  async detener(): Promise<void> {
    this.guardarNota(await this.grabadora!.terminar());
  }

  quitarNota(): void {
    this.viaje.ponerNota(null);
  }

  // ---------- Confirmar ----------

  confirmar(): void {
    const u = this.gps.ubicacion();
    const d = this.viaje.destino();
    if (!u || !d) return;
    this.viaje.origen.set({
      nombre: 'Mi ubicación',
      detalle: u.direccion,
      barrio: u.barrio,
      lat: u.lat,
      lng: u.lng,
    });
    this.lugares.recordar(d);
    this.nav.navigateForward('/cliente/viaje/confirmar');
  }

  private guardarNota(n: Parameters<ViajeService['ponerNota']>[0]): void {
    clearInterval(this.reloj);
    this.grabando.set(false);
    if (n) this.viaje.ponerNota(n);
    else this.errorNota.set('La nota quedó muy corta. Graba al menos un segundo.');
  }

  private cancelarGrabacion(): void {
    clearInterval(this.reloj);
    this.grabadora?.descartar();
    this.grabando.set(false);
  }

  private async buscar(valor: string): Promise<void> {
    this.consulta = new AbortController();
    try {
      const r = await this.lugares.buscar(valor, this.consulta.signal);
      this.resultados.set(r);
      if (!r.length) this.errorBusqueda.set(`No encontramos «${valor.trim()}» en Buenaventura. Prueba con el barrio o una calle.`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') this.errorBusqueda.set('No pudimos buscar. Revisa tu internet.');
    } finally {
      this.buscando.set(false);
    }
  }

  /** Lugares guardados (con coordenadas) + destinos recientes. Si viene ?lugar=ID, lo deja elegido. */
  private async cargarGuardados(): Promise<void> {
    const recientes: Opcion[] = this.lugares.recientes().map((lugar) => ({ lugar, icono: 'reloj', tono: 'gris', marca: 'reciente' }));
    let propios: Opcion[] = [];
    let dirs: Direccion[] = [];
    try {
      dirs = await this.api.get<Direccion[]>('/usuarios/direcciones');
      propios = dirs
        .filter((d) => d.lat != null && d.lng != null)
        .map((d) => ({
          lugar: { nombre: d.etiqueta, detalle: d.direccion, barrio: d.barrio, lat: Number(d.lat), lng: Number(d.lng) },
          icono: this.iconoDe(d.etiqueta),
          tono: 'amarillo',
          marca: 'guardado',
        }));
    } catch {
      /* sin conexión: solo recientes */
    }
    this.guardados.set([...propios, ...recientes]);

    const id = Number(this.ruta.snapshot.queryParamMap.get('lugar'));
    const elegido = id ? propios[dirs.filter((d) => d.lat != null && d.lng != null).findIndex((d) => d.id === id)] : undefined;
    if (elegido && !this.viaje.destino()) this.elegir(elegido);
  }

  private iconoDe(etiqueta: string): NombreIcono {
    const e = etiqueta.toLowerCase();
    if (e.includes('casa')) return 'casa';
    if (e.includes('trabajo') || e.includes('oficina')) return 'trabajo';
    return 'corazon';
  }
}
