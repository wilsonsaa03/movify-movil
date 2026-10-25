import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ToastController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../../core/api.service';
import { distancia } from '../../../core/formato';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { NotaVozComponent } from '../../../componentes/nota-voz/nota-voz.component';
import { BotonSosComponent } from '../../../componentes/boton-sos/boton-sos.component';
import { LugaresService, distanciaKm } from '../../../servicios/lugares.service';
import { UbicacionService } from '../../../servicios/ubicacion.service';
import { ViajeActivo, ViajeActivoService, iniciales, primerNombre, telefonoLimpio } from '../../../servicios/viaje-activo.service';

/** Cada cuánto se revisa si el pasajero canceló. */
const CADA_MS = 5000;
/** Se vuelve a pedir la ruta solo si el conductor se movió más de esto. */
const RECALCULAR_KM = 0.1;

/**
 * Conductor app 3 · Rumbo al pasajero (?id=servicio).
 * Píldora "RECOGE A ANA · 3 min · 600 m", mapa con su vehículo y la ruta a la recogida, SOS, el pasajero
 * (calificación, verificada, llamar y mensaje), la dirección y el punto de referencia con su nota de voz.
 * "Llegué" → en_origen → PIN (viaje) o En viaje (domicilio y encomienda: recoge el pedido).
 */
@Component({
  selector: 'app-conductor-recogida',
  templateUrl: 'conductor-recogida.page.html',
  styleUrls: ['conductor-recogida.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent, NotaVozComponent, BotonSosComponent],
})
export class ConductorRecogidaPage implements ViewDidEnter, ViewWillLeave, AfterViewInit, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly avisos = inject(ToastController);
  private readonly lugares = inject(LugaresService);
  private readonly gps = inject(UbicacionService);
  readonly viajes = inject(ViajeActivoService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;

  readonly v = signal<ViajeActivo | null>(null);
  readonly camino = signal<PuntoMapa[]>([]);
  readonly minutos = signal<number | null>(null);
  readonly metros = signal<number | null>(null);
  readonly notaUrl = signal<string | null>(null);
  readonly altoHoja = signal(0);
  readonly llegando = signal(false);
  readonly error = signal('');

  id = 0;
  private sondeo?: ReturnType<typeof setInterval>;
  private ultimaRuta: PuntoMapa | null = null;

  readonly yo = computed<PuntoMapa | null>(() => {
    const u = this.gps.ubicacion();
    return u ? { lat: u.lat, lng: u.lng } : null;
  });
  readonly recogida = computed(() => {
    const v = this.v();
    return v ? { lat: Number(v.origen_lat), lng: Number(v.origen_lng), nombre: primerNombre(v.usuario_nombre, 'Recogida') } : null;
  });
  readonly esViaje = computed(() => this.v()?.tipo_servicio === 'transporte');
  /** Si el viaje es para otra persona, se recoge a esa persona. */
  readonly pasajero = computed(() => this.v()?.pasajero_nombre?.trim() || this.v()?.usuario_nombre?.trim() || 'Pasajero');
  readonly pidioOtro = computed(() => (this.v()?.pasajero_nombre ? this.v()?.usuario_nombre?.trim() || null : null));
  readonly sinLeer = computed(() => Number(this.v()?.mensajes_sin_leer) || 0);
  readonly requisitos = computed(() => {
    const v = this.v();
    if (!v || v.tipo_servicio !== 'transporte') return [];
    return [
      v.necesita_casco ? 'Lleva casco para el pasajero' : '',
      Number(v.pasajeros) > 1 ? `${v.pasajeros} pasajeros` : '',
      v.lleva_equipaje ? 'Equipaje' : '',
      v.lleva_mascota ? 'Mascota' : '',
    ].filter(Boolean);
  });
  readonly inicial = computed(() => iniciales(this.pasajero()).charAt(0));
  /** "RECOGE A ANA" o, en domicilio/encomienda, "RECOGE EL PEDIDO". */
  readonly titulo = computed(() => {
    const v = this.v();
    if (!v) return 'Recogida';
    if (v.tipo_servicio === 'domicilio') return `Recoge el pedido${v.establecimiento ? ' en ' + v.establecimiento : ''}`;
    if (v.tipo_servicio === 'encomienda') return 'Recoge el paquete';
    return `Recoge a ${primerNombre(v.pasajero_nombre || v.usuario_nombre, 'tu pasajero')}`;
  });
  readonly llegada = computed(() => {
    const m = this.minutos();
    const km = this.metros();
    if (m === null || km === null) return 'Calculando…';
    return `${m} min · ${distancia(km)}`;
  });
  readonly calificacion = computed(() => {
    const c = Number(this.v()?.usuario_calificacion);
    return c ? c.toFixed(1).replace('.', ',') : null;
  });
  /** Se llama a quien viaja (si lo pidió otra persona, a ese celular). */
  readonly telefono = computed(() => telefonoLimpio(this.v()?.pasajero_telefono || this.v()?.usuario_telefono));

  ngAfterViewInit(): void {
    this.medidor = new ResizeObserver(() => this.altoHoja.set(this.hojaRef().nativeElement.offsetHeight));
    this.medidor.observe(this.hojaRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.medidor?.disconnect();
    clearInterval(this.sondeo);
  }

  ionViewDidEnter(): void {
    this.id = Number(this.ruta.snapshot.queryParamMap.get('id'));
    if (!this.id) {
      this.nav.navigateRoot('/conductor/inicio');
      return;
    }
    this.viajes.empezarReporte();
    this.revisar();
    this.sondeo = setInterval(() => this.revisar(), CADA_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.sondeo);
    const url = this.notaUrl();
    if (url) URL.revokeObjectURL(url);
    this.notaUrl.set(null);
  }

  chat(): void {
    this.nav.navigateForward('/conductor/viaje/chat', { queryParams: { id: this.id } });
  }

  async llegue(): Promise<void> {
    if (this.llegando()) return;
    this.llegando.set(true);
    this.error.set('');
    try {
      await this.viajes.avanzar(this.id, { estado: 'en_origen' });
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
      clearInterval(this.sondeo);
      // Viaje: se pide el PIN para empezar. Domicilio y encomienda: se recoge y se sigue a la entrega.
      this.nav.navigateRoot(this.esViaje() ? '/conductor/viaje/pin' : '/conductor/viaje/en-curso', { queryParams: { id: this.id } });
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos avisar que llegaste. Intenta de nuevo.');
    } finally {
      this.llegando.set(false);
    }
  }

  private async revisar(): Promise<void> {
    try {
      const v = await this.viajes.detalle(this.id);
      const primera = !this.v();
      const mensajesAntes = Number(this.v()?.mensajes_sin_leer) || 0;
      this.v.set(v);
      if (!primera && (Number(v.mensajes_sin_leer) || 0) > mensajesAntes) {
        Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
      }
      this.error.set('');
      if (v.estado_codigo === 'cancelado' || v.estado_codigo === 'expirado') {
        await this.salir('El pasajero canceló el viaje.');
        return;
      }
      if (v.estado_codigo !== 'asignado') {
        // Ya avanzó (p. ej. desde otro dispositivo): se lleva a la pantalla que toca
        this.nav.navigateRoot(v.estado_codigo === 'en_origen' && this.esViaje() ? '/conductor/viaje/pin' : '/conductor/viaje/en-curso', {
          queryParams: { id: this.id },
        });
        return;
      }
      if (primera && Number(v.nota_voz_segundos) > 0) {
        this.viajes.notaVoz(this.id).then((b) => this.notaUrl.set(URL.createObjectURL(b))).catch(() => undefined);
      }
      this.actualizarRuta();
    } catch (e) {
      const err = e as ErrorApi;
      if (err.status === 404 || err.status === 403) {
        await this.salir('Este viaje ya no está disponible.');
        return;
      }
      this.error.set('Sin conexión. Seguimos intentando…');
    }
  }

  private async actualizarRuta(): Promise<void> {
    const desde = this.yo();
    const meta = this.recogida();
    if (!desde || !meta) return;
    if (this.ultimaRuta && distanciaKm(this.ultimaRuta, desde) < RECALCULAR_KM) return;
    this.ultimaRuta = desde;
    const r = await this.lugares.ruta(desde, meta);
    this.camino.set(r.puntos);
    this.minutos.set(r.duracionMin);
    this.metros.set(r.distanciaKm);
  }

  private async salir(mensaje: string): Promise<void> {
    clearInterval(this.sondeo);
    this.viajes.pararReporte();
    Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
    const t = await this.avisos.create({ message: mensaje, duration: 3000, position: 'top', color: 'dark' });
    t.present();
    this.nav.navigateRoot('/conductor/inicio', { animationDirection: 'back' });
  }
}
