import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
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

/**
 * Viaje 1 · Inicio del cliente.
 * Saludo, mapa con su ubicación y el menú de servicios. Moto y taxi siguen a "¿A dónde vas?" (Viaje 2);
 * domicilio y encomienda abren su propio flujo. "Tus lugares" sale de las direcciones favoritas del backend.
 */
@Component({
  selector: 'app-cliente-inicio',
  templateUrl: 'cliente-inicio.page.html',
  styleUrls: ['cliente-inicio.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent, BarraInferiorComponent],
})
export class ClienteInicioPage implements ViewDidEnter, ViewWillLeave {
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

  ionViewDidEnter(): void {
    this.saludo.set(this.saludoSegunHora());
    this.cargarLugares();
    this.gps.seguir(); // el punto del mapa se mueve en tiempo real mientras esta pantalla está abierta
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
