import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonContent, IonFooter, NavController, ToastController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService, ErrorApi } from '../../../../core/api.service';
import { pesos } from '../../../../core/formato';
import { ViajeActivoService } from '../../../../servicios/viaje-activo.service';
import { IconoComponent, NombreIcono } from '../../../../componentes/icono/icono.component';
import { NotaVozComponent, formatear } from '../../../../componentes/nota-voz/nota-voz.component';
import { SelectorPuntoComponent } from '../../../../componentes/selector-punto/selector-punto.component';
import { Grabadora, MAX_SEGUNDOS_NOTA } from '../../../../servicios/grabadora';
import { Lugar, LugaresService, Parte, distanciaKm, normalizar, resaltar } from '../../../../servicios/lugares.service';
import { UbicacionService } from '../../../../servicios/ubicacion.service';
import { DetalleServicio, TipoVehiculo, ViajeService } from '../../../../servicios/viaje.service';

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
  /** El nombre partido para resaltar lo que coincide con lo escrito. */
  partes?: Parte[];
}

/** Espera tras la última tecla antes de buscar calles en línea (las sugerencias locales son instantáneas). */
const ESPERA_BUSQUEDA_MS = 300;
/** Máximo de sugerencias en pantalla (con el teclado abierto no caben más). */
const MAX_OPCIONES = 8;

/**
 * Viaje 2 · ¿A dónde vas?
 * DESDE = ubicación real del GPS (barrio y dirección), o un punto tocado en el mapa. HASTA = buscador de
 * direcciones en Buenaventura, con sus lugares guardados y los destinos recientes, o "Elegir en el mapa".
 * Punto de referencia en texto y/o nota de voz (hasta 30 s). "Confirmar destino" → Viaje 3.
 */
@Component({
  selector: 'app-viaje-destino',
  templateUrl: 'viaje-destino.page.html',
  styleUrls: ['viaje-destino.page.scss'],
  imports: [IonContent, IonFooter, FormsModule, IconoComponent, NotaVozComponent, SelectorPuntoComponent],
})
export class ViajeDestinoPage implements ViewDidEnter, ViewWillLeave, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly gps = inject(UbicacionService);
  private readonly lugares = inject(LugaresService);
  private readonly activo = inject(ViajeActivoService);
  private readonly alertas = inject(AlertController);
  private readonly avisos = inject(ToastController);
  readonly viaje = inject(ViajeService);

  readonly texto = signal(this.viaje.destino()?.nombre ?? '');
  readonly buscando = signal(false);
  readonly resultados = signal<Lugar[]>([]);
  readonly errorBusqueda = signal('');
  readonly guardados = signal<Opcion[]>([]);
  /** Barrios y sitios de Buenaventura para sugerir al instante (se descarga una vez y queda guardado). */
  private readonly catalogo = signal<Lugar[]>([]);
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

  /** Recogida marcada a mano en el mapa (null = la del GPS). */
  readonly origenElegido = signal<Lugar | null>(null);
  /** Qué punto se está eligiendo en el mapa (pantalla completa encima). */
  readonly eligiendo = signal<'origen' | 'destino' | 'parada' | null>(null);

  /**
   * ?cambiar=ID: el viaje ya va andando y el pasajero cambia el destino o la parada (Uber: "Cambiar destino").
   * La recogida no se toca y antes de cambiar se muestra el valor nuevo.
   */
  readonly cambiarId = Number(this.ruta.snapshot.queryParamMap.get('cambiar')) || 0;
  readonly servicioActual = signal<DetalleServicio | null>(null);
  readonly cambiando = signal(false);
  readonly errorCambio = signal('');

  /** DESDE: el punto elegido en el mapa o, si no, la posición del GPS con su dirección. */
  readonly origenTexto = computed(() => {
    const s = this.servicioActual();
    if (this.cambiarId) return s ? s.origen : 'Tu recogida';
    const o = this.origenElegido();
    if (o) return o.nombre;
    const u = this.gps.ubicacion();
    if (!u) return this.gps.estado() === 'sin-permiso' ? 'Activa tu ubicación' : 'Buscando tu ubicación…';
    const donde = u.direccion ?? u.barrio ?? u.ciudad;
    return donde ? `Mi ubicación · ${donde}` : 'Mi ubicación';
  });

  /**
   * Lo que se muestra debajo del buscador.
   * Sin texto: guardados y recientes. Escribiendo: primero las sugerencias locales (guardados, recientes,
   * barrios y sitios, desde la primera letra) y después las calles/direcciones que encuentre en línea.
   */
  readonly opciones = computed<Opcion[]>(() => {
    const t = this.texto().trim();
    const propios = this.guardados();
    if (!t) return propios;

    const locales = this.lugares.sugerir(t, this.catalogo(), propios.map((o) => o.lugar), 5);
    const enLinea = this.resultados().filter((r) => !locales.some((l) => mismoLugar(l, r)));
    return [...locales, ...enLinea].slice(0, MAX_OPCIONES).map((lugar) => {
      const propio = propios.find((o) => o.lugar === lugar);
      const base: Opcion = propio ?? { lugar, icono: lugar.categoria === 'Calle' ? 'navegar' : 'pin', tono: 'gris' };
      return { ...base, partes: resaltar(lugar.nombre, t) };
    });
  });

  readonly puedeConfirmar = computed(() => {
    if (this.cambiarId) return !!this.viaje.destino() && !!this.servicioActual() && !this.cambiando();
    return !!this.viaje.destino() && (!!this.origenElegido() || !!this.gps.ubicacion()) && !this.grabando();
  });

  constructor() {
    const tipo = this.ruta.snapshot.queryParamMap.get('tipo');
    if (tipo === 'moto' || tipo === 'taxi') this.viaje.tipo.set(tipo);
  }

  ionViewDidEnter(): void {
    this.gps.seguir();
    this.cargarGuardados();
    this.lugares.catalogo().then((c) => this.catalogo.set(c));
    if (this.cambiarId) this.cargarServicio();
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

  // ---------- Elegir en el mapa ----------

  /** El punto tocado en el mapa: la recogida, la parada o el destino. */
  elegidoEnMapa(l: Lugar): void {
    if (this.eligiendo() === 'origen') {
      this.origenElegido.set(l);
    } else if (this.eligiendo() === 'parada') {
      this.viaje.parada.set(l);
    } else {
      clearTimeout(this.temporizador);
      this.consulta?.abort();
      this.buscando.set(false);
      this.errorBusqueda.set('');
      this.viaje.destino.set(l);
      this.texto.set(l.nombre);
    }
    this.eligiendo.set(null);
  }

  /** La recogida vuelve a ser la ubicación del GPS. */
  usarGps(): void {
    this.origenElegido.set(null);
    this.eligiendo.set(null);
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

  quitarParada(): void {
    this.viaje.parada.set(null);
  }

  // ---------- Confirmar ----------

  confirmar(): void {
    if (this.cambiarId) {
      this.confirmarCambio();
      return;
    }
    const u = this.gps.ubicacion();
    const d = this.viaje.destino();
    const o = this.origenElegido();
    if ((!u && !o) || !d) return;
    this.viaje.origen.set(
      o ?? {
        nombre: 'Mi ubicación',
        detalle: u!.direccion,
        barrio: u!.barrio,
        lat: u!.lat,
        lng: u!.lng,
      },
    );
    this.lugares.recordar(d);
    this.nav.navigateForward('/cliente/viaje/confirmar');
  }

  /** Viaje andando: precio nuevo → "¿Cambiar?" → POST /servicios/{id}/destino → de vuelta al viaje. */
  private async confirmarCambio(): Promise<void> {
    const s = this.servicioActual();
    const d = this.viaje.destino();
    if (!s || !d || this.cambiando()) return;
    this.cambiando.set(true);
    this.errorCambio.set('');
    const p = this.viaje.parada();
    try {
      // Lo que cuesta la ruta nueva + lo que el pasajero haya ofrecido de más al pedir
      const c = await this.api.get<{ opciones: { tipo_vehiculo: string; valor_estimado: number }[] }>(
        `/tarifas/cotizar?tipo_servicio=transporte&tipo_vehiculo=${s.tipo_vehiculo}&origen_lat=${s.origen_lat}&origen_lng=${s.origen_lng}` +
          `&destino_lat=${d.lat}&destino_lng=${d.lng}` + (p ? `&parada_lat=${p.lat}&parada_lng=${p.lng}` : ''),
      );
      const extra = Math.max(0, Number(s.tarifa) - Number(s.valor_sugerido ?? s.tarifa));
      const nuevo = Number(c.opciones[0]?.valor_estimado ?? 0) + extra;
      const alerta = await this.alertas.create({
        header: '¿Cambiar el destino?',
        message: `El viaje quedará en ${pesos(nuevo)} (antes ${pesos(s.tarifa)}). Le avisaremos a tu conductor.`,
        buttons: [
          { text: 'No', role: 'cancel' },
          { text: 'Sí, cambiar', role: 'confirm' },
        ],
      });
      await alerta.present();
      if ((await alerta.onDidDismiss()).role !== 'confirm') return;
      const r = await this.activo.cambiarDestino(this.cambiarId, {
        destino: d.detalle ? `${d.nombre}, ${d.detalle}` : d.nombre,
        destino_barrio: d.barrio,
        destino_lat: d.lat,
        destino_lng: d.lng,
        parada: p ? (p.detalle ? `${p.nombre}, ${p.detalle}` : p.nombre) : null,
        parada_lat: p?.lat ?? null,
        parada_lng: p?.lng ?? null,
      });
      this.lugares.recordar(d);
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
      (await this.avisos.create({ message: r.message, duration: 3000, position: 'top', color: 'dark' })).present();
      this.viaje.olvidar();
      this.nav.navigateBack('/cliente/viaje/en-camino', { queryParams: { id: this.cambiarId } });
    } catch (e) {
      this.errorCambio.set((e as ErrorApi).message || 'No pudimos cambiar el destino. Intenta de nuevo.');
    } finally {
      this.cambiando.set(false);
    }
  }

  /** Modo cambio: el viaje actual (recogida fija) con su destino y parada ya puestos. */
  private async cargarServicio(): Promise<void> {
    try {
      const s = await this.viaje.detalle(this.cambiarId);
      this.servicioActual.set(s);
      this.viaje.tipo.set(s.tipo_vehiculo);
      if (!this.viaje.destino()) {
        const [nombre, ...resto] = s.destino.split(',');
        this.viaje.destino.set({ nombre: nombre.trim(), detalle: resto.join(',').trim() || null, barrio: s.destino_barrio, lat: Number(s.destino_lat), lng: Number(s.destino_lng) });
        this.texto.set(nombre.trim());
      }
      if (s.parada_lat != null && s.parada_lng != null && !this.viaje.parada()) {
        this.viaje.parada.set({ nombre: s.parada ?? 'Parada', detalle: null, barrio: null, lat: Number(s.parada_lat), lng: Number(s.parada_lng) });
      }
    } catch (e) {
      this.errorCambio.set((e as ErrorApi).message || 'No pudimos cargar tu viaje.');
    }
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
      this.resultados.set(await this.lugares.buscar(valor, this.consulta.signal));
      // Solo se avisa si tampoco hubo sugerencias locales
      if (!this.opciones().length) {
        this.errorBusqueda.set(`No encontramos «${valor.trim()}» en Buenaventura. Prueba con el barrio, un sitio conocido o una calle (ej.: Calle 6).`);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && !this.opciones().length) this.errorBusqueda.set('No pudimos buscar. Revisa tu internet.');
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

/** ¿Es el mismo sitio? (mismo nombre y a menos de 60 m): evita mostrarlo dos veces. */
function mismoLugar(a: Lugar, b: Lugar): boolean {
  return normalizar(a.nombre) === normalizar(b.nombre) && distanciaKm(a, b) < 0.06;
}
