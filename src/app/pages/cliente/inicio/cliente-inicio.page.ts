import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Gesture, GestureController, IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService } from '../../../core/api.service';
import { SesionService } from '../../../core/sesion.service';
import { UbicacionService } from '../../../servicios/ubicacion.service';
import { IconoComponent, NombreIcono } from '../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { BarraInferiorComponent, ItemBarra } from '../../../componentes/barra-inferior/barra-inferior.component';

type TipoServicio = 'moto' | 'taxi' | 'domicilio' | 'encomienda';

interface TarjetaServicio {
  id: TipoServicio;
  nombre: string;
  detalle: string;
  icono: NombreIcono;
}

/** Fila de GET /api/usuarios/direcciones (tabla direcciones_favoritas). */
interface Direccion {
  id: number;
  etiqueta: string;
  direccion: string;
  barrio: string | null;
}

interface Lugar {
  id: number | null; // null = sugerencia para agregar (todavía no guardada)
  etiqueta: string;
  icono: NombreIcono;
}

export const BARRA_CLIENTE: ItemBarra[] = [
  { texto: 'Inicio', icono: 'casa', ruta: '/cliente' },
  { texto: 'Mis pedidos', icono: 'lista', ruta: '/cliente/pedidos' },
  { texto: 'Perfil', icono: 'persona', ruta: '/cliente/perfil' },
];

/** Velocidad (px/ms) a partir de la cual un "lanzamiento" corto decide abrir o cerrar la hoja. */
const LANZAMIENTO = 0.35;
/** Mapa que queda a la vista con la hoja abierta (px). */
const FRANJA_MAPA = 96;

/**
 * Viaje 1 · Inicio del cliente.
 * Saludo, mapa en tiempo real y la hoja de servicios. Empieza abajo (título + "Hacer viaje") con el mapa grande;
 * "Hacer viaje" la sube y el botón se recoge. También se arrastra o se toca la barrita.
 * Moto y taxi siguen a "¿A dónde vas?" (Viaje 2); domicilio y encomienda abren su propio flujo.
 * "Tus lugares" sale de las direcciones favoritas del backend.
 */
@Component({
  selector: 'app-cliente-inicio',
  templateUrl: 'cliente-inicio.page.html',
  styleUrls: ['cliente-inicio.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent, BarraInferiorComponent],
})
export class ClienteInicioPage implements AfterViewInit, OnDestroy, ViewDidEnter, ViewWillLeave {
  private readonly gestos = inject(GestureController);
  private readonly pantallaRef = viewChild.required<ElementRef<HTMLElement>>('pantalla');
  private readonly cieloRef = viewChild.required<ElementRef<HTMLElement>>('cielo');
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private readonly agarreRef = viewChild.required<ElementRef<HTMLElement>>('agarre');
  private readonly botonViajeRef = viewChild.required<ElementRef<HTMLElement>>('botonViaje');
  private gesto?: Gesture;
  private medidor?: ResizeObserver;
  private inicioArrastre = 0;

  // ---------- Hoja deslizable ----------
  /** false (al entrar) = abajo, pequeña: título + "Hacer viaje". true = arriba con todos los servicios. */
  readonly abierta = signal(false);
  /** Hasta medir la hoja no se muestra, para que no aparezca abierta un instante. */
  readonly medida = signal(false);
  readonly arrastrando = signal(false);
  /** Cuánto baja la hoja (px). 0 = abierta del todo. */
  readonly desplazamiento = signal(0);
  /** Lo máximo que puede bajar: alto de la hoja menos la parte que queda visible cerrada. */
  private readonly recorrido = signal(0);
  private readonly altoHoja = signal(0);
  /** Para que la hoja abierta no tape el saludo. */
  readonly altoMaximo = signal<number | null>(null);
  /** Lo que tapa la hoja sobre el mapa (se actualiza al soltarla, no en cada píxel del arrastre). */
  readonly altoVisibleHoja = signal(0);

  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly gps = inject(UbicacionService);
  private readonly mapa = viewChild(MapaCiudadComponent);
  readonly precision = computed(() => this.gps.ubicacion()?.precision ?? null);

  readonly barra = BARRA_CLIENTE;

  /** Chip del mapa: "Estás en <barrio>" y debajo la dirección (Cra 3 #5-20). */
  readonly lugarTitulo = computed(() => {
    const u = this.gps.ubicacion();
    const estado = this.gps.estado();
    if (estado === 'sin-permiso') return 'Activa tu ubicación';
    if (u) return this.textoLugar(u.barrio, u.ciudad);
    return estado === 'error' ? 'No pudimos ubicarte' : 'Buscando tu ubicación…';
  });
  readonly lugarDetalle = computed(() => {
    if (this.gps.estado() === 'sin-permiso') return 'Toca aquí para intentar de nuevo';
    if (this.gps.estado() === 'error' && !this.gps.ubicacion()) return 'Toca aquí para intentar de nuevo';
    return this.gps.ubicacion()?.direccion ?? '';
  });
  readonly buscandoLugar = computed(() => this.gps.estado() === 'buscando' && !this.gps.ubicacion());
  /** Punto del mapa (Leaflet). Mientras no haya GPS, el mapa muestra Buenaventura sin marcador. */
  readonly miPunto = computed<PuntoMapa | null>(() => {
    const u = this.gps.ubicacion();
    return u ? { lat: u.lat, lng: u.lng } : null;
  });

  readonly nombre = computed(() => {
    const d = this.sesion.datos();
    return (d?.nombres || d?.nombre || '').trim().split(/\s+/)[0] || 'vecino';
  });
  readonly inicial = computed(() => this.nombre().charAt(0).toUpperCase());
  readonly foto = computed(() => this.sesion.datos()?.foto ?? null);
  readonly saludo = signal(this.saludoSegunHora());

  readonly servicios: TarjetaServicio[] = [
    { id: 'moto', nombre: 'Moto', detalle: 'Viaja rápido, 1 pasajero', icono: 'moto' },
    { id: 'taxi', nombre: 'Taxi', detalle: 'Viaja con hasta 4 personas', icono: 'taxi' },
    { id: 'domicilio', nombre: 'Domicilio', detalle: 'Te llevamos lo que pidas', icono: 'domicilio' },
    { id: 'encomienda', nombre: 'Encomienda', detalle: 'Envía paquetes en la ciudad', icono: 'encomienda' },
  ];

  /** Mientras carga (o si falla) se muestran Casa y Trabajo como sugerencias para agregar. */
  readonly lugares = signal<Lugar[]>(this.sugerencias());

  constructor() {
    // Si venía de la pantalla de inicio eligiendo un servicio (/login?servicio=moto), lo lleva directo
    const elegido = this.ruta.snapshot.queryParamMap.get('servicio') as TipoServicio | null;
    if (elegido && this.servicios.some((s) => s.id === elegido)) {
      setTimeout(() => this.abrir(elegido), 350);
    }
  }

  ngAfterViewInit(): void {
    this.gesto = this.gestos.create({
      el: this.agarreRef().nativeElement,
      gestureName: 'hoja-servicios',
      direction: 'y',
      threshold: 6,
      onStart: () => {
        this.inicioArrastre = this.desplazamiento();
        this.arrastrando.set(true);
      },
      onMove: (e) => {
        // Se puede estirar un poco más allá de los topes, con resistencia (como una hoja nativa)
        const d = this.inicioArrastre + e.deltaY;
        const max = this.recorrido();
        this.desplazamiento.set(d < 0 ? d / 4 : d > max ? max + (d - max) / 4 : d);
      },
      onEnd: (e) => {
        this.arrastrando.set(false);
        const mitad = this.recorrido() / 2;
        const abrir = e.velocityY < -LANZAMIENTO ? true : e.velocityY > LANZAMIENTO ? false : this.desplazamiento() < mitad;
        this.fijarHoja(abrir);
      },
    });
    this.gesto.enable();

    // Se vuelve a medir si cambia la pantalla (rotación, teclado) o el contenido (llegan "Tus lugares")
    this.medidor = new ResizeObserver(() => this.medir());
    this.medidor.observe(this.pantallaRef().nativeElement);
    this.medidor.observe(this.hojaRef().nativeElement);
    // El botón crece/se recoge con animación: al terminar cambia lo que se ve con la hoja abajo
    this.medidor.observe(this.botonViajeRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.gesto?.destroy();
    this.medidor?.disconnect();
  }

  ionViewDidEnter(): void {
    this.saludo.set(this.saludoSegunHora());
    this.cargarLugares();
    this.gps.seguir(); // el punto del mapa se mueve en tiempo real mientras esta pantalla está abierta
    this.medir();
  }

  alternarHoja(): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.fijarHoja(!this.abierta());
  }

  /** "Hacer viaje": sube la hoja con los servicios y el botón se recoge (vuelve si la bajan de nuevo). */
  hacerViaje(): void {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
    this.fijarHoja(true);
  }

  private fijarHoja(abrir: boolean): void {
    this.abierta.set(abrir);
    if (!abrir) this.hojaRef().nativeElement.scrollTop = 0;
    this.desplazamiento.set(abrir ? 0 : this.recorrido());
    this.altoVisibleHoja.set(this.altoHoja() - this.desplazamiento());
  }

  /** Calcula hasta dónde puede subir la hoja y cuánto baja al cerrarse. */
  private medir(): void {
    const pantalla = this.pantallaRef().nativeElement;
    const cielo = this.cieloRef().nativeElement;
    // Abierta deja siempre una franja de mapa con el aviso "Estás en…" (lo demás se desplaza dentro de la hoja)
    this.altoMaximo.set(Math.max(240, pantalla.clientHeight - cielo.offsetHeight - FRANJA_MAPA));

    requestAnimationFrame(() => {
      const hoja = this.hojaRef().nativeElement;
      // Abajo se ve: asa + título + "Hacer viaje". Se usa el alto completo del botón (scrollHeight)
      // aunque en este momento esté recogido, para que la cuenta sirva en los dos estados.
      const boton = this.botonViajeRef().nativeElement;
      const visibleCerrada = boton.offsetTop + (boton.firstElementChild as HTMLElement).scrollHeight + 6;
      this.altoHoja.set(hoja.offsetHeight);
      this.recorrido.set(Math.max(0, hoja.offsetHeight - visibleCerrada));
      if (!this.arrastrando()) this.fijarHoja(this.abierta());
      this.medida.set(true);
    });
  }

  ionViewWillLeave(): void {
    this.gps.dejarDeSeguir();
  }

  /** Tocar el chip vuelve a pedir la ubicación (útil si negó el permiso) y centra el mapa en el usuario. */
  async reubicar(): Promise<void> {
    await this.gps.actualizar();
    this.mapa()?.recentrar();
  }

  private textoLugar(barrio: string | null, ciudad: string | null): string {
    return `Estás en ${barrio ?? ciudad ?? 'Buenaventura'}`;
  }

  elegir(id: TipoServicio): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.abrir(id);
  }

  /** Un lugar guardado es un atajo: pide moto con ese destino ya puesto. Una sugerencia abre "agregar lugar". */
  irALugar(l: Lugar): void {
    if (l.id === null) {
      this.nav.navigateForward('/cliente/lugares', { queryParams: { nuevo: l.etiqueta } });
    } else {
      this.nav.navigateForward('/cliente/viaje/destino', { queryParams: { tipo: 'moto', lugar: l.id } });
    }
  }

  notificaciones(): void {
    this.nav.navigateForward('/cliente/notificaciones');
  }

  private abrir(id: TipoServicio): void {
    if (id === 'moto' || id === 'taxi') {
      this.nav.navigateForward('/cliente/viaje/destino', { queryParams: { tipo: id } });
    } else {
      this.nav.navigateForward(`/cliente/${id}`);
    }
  }

  private async cargarLugares(): Promise<void> {
    try {
      const dirs = await this.api.get<Direccion[]>('/usuarios/direcciones');
      this.lugares.set(dirs.length ? dirs.map((d) => ({ id: d.id, etiqueta: d.etiqueta, icono: this.iconoDe(d.etiqueta) })) : this.sugerencias());
    } catch {
      this.lugares.set(this.sugerencias()); // sin conexión: no se bloquea la pantalla
    }
  }

  private iconoDe(etiqueta: string): NombreIcono {
    const e = etiqueta.toLowerCase();
    if (e.includes('casa')) return 'casa';
    if (e.includes('trabajo') || e.includes('oficina')) return 'trabajo';
    return 'corazon';
  }

  private sugerencias(): Lugar[] {
    return [
      { id: null, etiqueta: 'Casa', icono: 'casa' },
      { id: null, etiqueta: 'Trabajo', icono: 'trabajo' },
    ];
  }

  private saludoSegunHora(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días,' : h < 19 ? 'Buenas tardes,' : 'Buenas noches,';
  }
}
