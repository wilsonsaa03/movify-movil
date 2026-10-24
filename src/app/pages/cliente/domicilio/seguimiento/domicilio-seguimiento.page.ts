import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonContent, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { LugaresService, distanciaKm } from '../../../../servicios/lugares.service';
import { hora } from '../../../../servicios/encomienda.service';
import { DetalleDomicilio, DomicilioService, MIN_COMPRA } from '../../../../servicios/domicilio.service';

/** Cada cuánto se pregunta dónde va el domiciliario. */
const CADA_MS = 4000;
/** Se vuelve a pedir la ruta solo si el domiciliario se movió más de esto (OSRM es un servicio público). */
const RECALCULAR_KM = 0.15;

type EstadoPaso = 'hecho' | 'actual' | 'pendiente';

/**
 * Domicilio 4 · Seguimiento (?id=servicio).
 * Tarjeta arriba con la fase ("COMPRANDO TU PEDIDO"), "Llega a las 5:20 p. m.", los minutos y los 4 pasos
 * (Asignado → Comprando → En camino → Entregado). Mapa con la moto y la ruta; domiciliario, placa y
 * Llamar / Mensaje / Compartir. Al finalizar → Domicilio 5 (Entregado).
 */
@Component({
  selector: 'app-domicilio-seguimiento',
  templateUrl: 'domicilio-seguimiento.page.html',
  styleUrls: ['domicilio-seguimiento.page.scss'],
  imports: [IonContent, IconoComponent, MapaCiudadComponent],
})
export class DomicilioSeguimientoPage implements ViewDidEnter, ViewWillLeave, AfterViewInit, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly alertas = inject(AlertController);
  private readonly lugares = inject(LugaresService);
  private readonly domicilios = inject(DomicilioService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;

  readonly servicio = signal<DetalleDomicilio | null>(null);
  readonly camino = signal<PuntoMapa[]>([]);
  readonly minutos = signal<number | null>(null);
  readonly altoHoja = signal(0);
  readonly error = signal('');
  readonly cancelando = signal(false);

  private id = 0;
  private sondeo?: ReturnType<typeof setInterval>;
  private ultimaRuta: { desde: PuntoMapa; fase: string } | null = null;
  /** Minutos de la tienda a la casa (se calcula una vez). */
  private tramoFinal: number | null = null;

  readonly compra = computed(() => !!this.servicio()?.requiere_compra);
  readonly recogido = computed(() => this.servicio()?.estado_codigo === 'en_curso');
  readonly tienda = computed(() => this.servicio()?.establecimiento ?? 'la tienda');
  readonly nombre = computed(() => (this.servicio()?.conductor_nombre ?? 'Tu domiciliario').split(/\s+/)[0]);
  readonly moto = computed<PuntoMapa | null>(() => {
    const s = this.servicio();
    return s?.conductor_lat != null && s.conductor_lng != null ? { lat: Number(s.conductor_lat), lng: Number(s.conductor_lng) } : null;
  });
  /** Antes de recoger el pin es la tienda; después, la casa. */
  readonly meta = computed(() => {
    const s = this.servicio();
    if (!s) return null;
    return this.recogido()
      ? { lat: Number(s.destino_lat), lng: Number(s.destino_lng), nombre: 'Tu casa' }
      : { lat: Number(s.origen_lat), lng: Number(s.origen_lng), nombre: s.establecimiento ?? 'Recogida' };
  });

  /** "COMPRANDO TU PEDIDO", "VA A LA TIENDA"... */
  readonly fase = computed(() => {
    const e = this.servicio()?.estado_codigo;
    if (e === 'en_origen') return this.compra() ? 'Comprando tu pedido' : 'Recogiendo tu pedido';
    if (e === 'en_curso') return 'Tu pedido va en camino';
    return `Va hacia ${this.tienda()}`;
  });
  readonly llegaA = computed(() => {
    const m = this.minutos();
    return m != null ? hora(new Date(Date.now() + m * 60000).toISOString()) : null;
  });
  readonly pasos = computed<{ nombre: string; estado: EstadoPaso }[]>(() => {
    const orden = ['asignado', 'en_origen', 'en_curso', 'finalizado'];
    const i = Math.max(0, orden.indexOf(this.servicio()?.estado_codigo ?? 'asignado'));
    const nombres = ['Asignado', this.compra() ? 'Comprando' : 'Recogiendo', 'En camino', 'Entregado'];
    return nombres.map((nombre, j) => ({ nombre, estado: j < i ? 'hecho' : j === i ? 'actual' : 'pendiente' }));
  });
  /** Aviso naranja del Figma, según la fase. */
  readonly nota = computed(() => {
    const e = this.servicio()?.estado_codigo;
    if (e === 'en_origen') {
      return this.compra()
        ? `${this.nombre()} está en ${this.tienda()}. Paga tu pedido y te mostrará la factura al entregar.`
        : `${this.nombre()} está recogiendo tu pedido en ${this.tienda()}.`;
    }
    if (e === 'en_curso') return `${this.nombre()} va en camino con tu pedido. Ten listo el efectivo.`;
    return `${this.nombre()} va hacia ${this.tienda()}.`;
  });
  readonly iniciales = computed(() =>
    (this.servicio()?.conductor_nombre ?? '')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join(''),
  );
  readonly telefono = computed(() => (this.servicio()?.conductor_telefono ?? '').replace(/[^\d+]/g, ''));
  readonly puedeCancelar = computed(() => this.servicio()?.estado_codigo === 'asignado');

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
      this.nav.navigateRoot('/cliente');
      return;
    }
    this.revisar();
    this.sondeo = setInterval(() => this.revisar(), CADA_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.sondeo);
  }

  alInicio(): void {
    this.nav.navigateRoot('/cliente', { animationDirection: 'back' });
  }

  /** Comparte cómo va el pedido (WhatsApp o lo que tenga el celular). */
  async compartir(): Promise<void> {
    const texto = `Mi domicilio de MoviFY: ${this.fase().toLowerCase()}${this.llegaA() ? `, llega a las ${this.llegaA()}` : ''}.`;
    if (navigator.share) {
      await navigator.share({ text: texto }).catch(() => undefined);
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }

  async cancelar(): Promise<void> {
    const alerta = await this.alertas.create({
      header: '¿Cancelar el domicilio?',
      message: 'El domiciliario todavía no ha llegado a la tienda. Si cancelas, dejará de ir por tu pedido.',
      buttons: [
        { text: 'Seguir con el pedido', role: 'cancel' },
        { text: 'Sí, cancelar', role: 'destructive' },
      ],
    });
    await alerta.present();
    if ((await alerta.onDidDismiss()).role !== 'destructive') return;
    this.cancelando.set(true);
    try {
      await this.domicilios.cancelar(this.id);
      clearInterval(this.sondeo);
      this.nav.navigateRoot('/cliente', { animationDirection: 'back' });
    } catch (e) {
      this.error.set((e as ErrorApi).message);
      this.revisar();
    } finally {
      this.cancelando.set(false);
    }
  }

  private async revisar(): Promise<void> {
    try {
      const s = await this.domicilios.detalle(this.id);
      this.servicio.set(s);
      this.error.set('');
      switch (s.estado_codigo) {
        case 'finalizado':
          clearInterval(this.sondeo);
          Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
          this.nav.navigateRoot('/cliente/domicilio/entregado', { queryParams: { id: this.id } });
          return;
        case 'cancelado':
        case 'expirado':
          clearInterval(this.sondeo);
          this.error.set('Este domicilio fue cancelado.');
          return;
        case 'buscando':
          // El domiciliario lo soltó: se busca otro
          clearInterval(this.sondeo);
          this.nav.navigateRoot('/cliente/viaje/buscando', { queryParams: { id: this.id } });
          return;
      }
      this.actualizarRuta();
    } catch (e) {
      const err = e as ErrorApi;
      if (err.status === 404 || err.status === 403) {
        clearInterval(this.sondeo);
        this.nav.navigateRoot('/cliente');
        return;
      }
      this.error.set('Sin conexión. Seguimos intentando…');
    }
  }

  /**
   * Ruta de la moto a la meta y minutos hasta la casa: antes de recoger se suma el tramo tienda → casa
   * (y la compra); después, solo lo que le falta.
   */
  private async actualizarRuta(): Promise<void> {
    const s = this.servicio()!;
    const desde = this.moto();
    const meta = this.meta();
    if (!desde || !meta) return;
    const u = this.ultimaRuta;
    if (u && u.fase === s.estado_codigo && distanciaKm(u.desde, desde) < RECALCULAR_KM) return;
    this.ultimaRuta = { desde, fase: s.estado_codigo };
    const r = await this.lugares.ruta(desde, meta);
    this.camino.set(r.puntos);
    if (this.recogido()) {
      this.minutos.set(r.duracionMin);
      return;
    }
    if (this.tramoFinal === null) {
      const final = await this.lugares.ruta(
        { lat: Number(s.origen_lat), lng: Number(s.origen_lng) },
        { lat: Number(s.destino_lat), lng: Number(s.destino_lng) },
      );
      this.tramoFinal = final.duracionMin;
    }
    const comprando = this.compra() ? MIN_COMPRA : 2;
    this.minutos.set((s.estado_codigo === 'en_origen' ? 0 : r.duracionMin) + comprando + this.tramoFinal);
  }
}
