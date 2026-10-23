import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService } from '../../../../core/api.service';
import { IconoComponent, NombreIcono } from '../../../../componentes/icono/icono.component';
import { NotaVozComponent, formatear } from '../../../../componentes/nota-voz/nota-voz.component';
import { SelectorPuntoComponent } from '../../../../componentes/selector-punto/selector-punto.component';
import { Grabadora, MAX_SEGUNDOS_NOTA } from '../../../../servicios/grabadora';
import { Lugar, LugaresService, Parte, distanciaKm, normalizar, resaltar } from '../../../../servicios/lugares.service';
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
  readonly eligiendo = signal<'origen' | 'destino' | null>(null);

  /** DESDE: el punto elegido en el mapa o, si no, la posición del GPS con su dirección. */
  readonly origenTexto = computed(() => {
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

  readonly puedeConfirmar = computed(
    () => !!this.viaje.destino() && (!!this.origenElegido() || !!this.gps.ubicacion()) && !this.grabando(),
  );

  constructor() {
    const tipo = this.ruta.snapshot.queryParamMap.get('tipo');
    if (tipo === 'moto' || tipo === 'taxi') this.viaje.tipo.set(tipo);
  }

  ionViewDidEnter(): void {
    this.gps.seguir();
    this.cargarGuardados();
    this.lugares.catalogo().then((c) => this.catalogo.set(c));
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

  /** El punto tocado en el mapa: la recogida o el destino. */
  elegidoEnMapa(l: Lugar): void {
    if (this.eligiendo() === 'origen') {
      this.origenElegido.set(l);
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

  // ---------- Confirmar ----------

  confirmar(): void {
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
