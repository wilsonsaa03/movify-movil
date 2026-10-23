import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonContent, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { LugaresService, distanciaKm } from '../../../../servicios/lugares.service';
import { DatosPaquete, DetalleEnvio, EncomiendaService, PasoHistorial, hora } from '../../../../servicios/encomienda.service';

/** Cada cuánto se pregunta dónde va el conductor. */
const CADA_MS = 4000;
/** Se vuelve a pedir la ruta solo si el conductor se movió más de esto (OSRM es un servicio público). */
const RECALCULAR_KM = 0.15;

type Paso = { titulo: string; detalle: string | null; estado: 'hecho' | 'actual' | 'pendiente' };

/**
 * Encomienda 4 · Seguimiento (?id=servicio).
 * Mapa con el vehículo del conductor y la ruta hasta la recogida o la entrega, "Tu paquete llega en N min",
 * conductor y placa, línea de tiempo (recogido → en camino → entregado), el código de entrega y
 * Llamar / Enviar código / Mensaje. Al finalizar → Encomienda 5 (Entregada).
 */
@Component({
  selector: 'app-encomienda-seguimiento',
  templateUrl: 'encomienda-seguimiento.page.html',
  styleUrls: ['encomienda-seguimiento.page.scss'],
  imports: [IonContent, IconoComponent, MapaCiudadComponent],
})
export class EncomiendaSeguimientoPage implements ViewDidEnter, ViewWillLeave, AfterViewInit, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly alertas = inject(AlertController);
  private readonly lugares = inject(LugaresService);
  private readonly envio = inject(EncomiendaService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;

  readonly servicio = signal<DetalleEnvio | null>(null);
  readonly paquete = signal<DatosPaquete | null>(null);
  private readonly historial = signal<PasoHistorial[]>([]);
  readonly camino = signal<PuntoMapa[]>([]);
  readonly minutos = signal<number | null>(null);
  readonly altoHoja = signal(0);
  readonly error = signal('');
  readonly cancelando = signal(false);

  private id = 0;
  private sondeo?: ReturnType<typeof setInterval>;
  private ultimaRuta: { desde: PuntoMapa; fase: string } | null = null;

  /** Antes de recoger se va hacia el origen; después, hacia la entrega. */
  readonly recogido = computed(() => this.servicio()?.estado_codigo === 'en_curso');
  readonly conductor = computed<PuntoMapa | null>(() => {
    const s = this.servicio();
    return s?.conductor_lat != null && s.conductor_lng != null ? { lat: Number(s.conductor_lat), lng: Number(s.conductor_lng) } : null;
  });
  readonly meta = computed(() => {
    const s = this.servicio();
    if (!s) return null;
    return this.recogido()
      ? { lat: Number(s.destino_lat), lng: Number(s.destino_lng), nombre: s.destino_barrio ?? s.destino }
      : { lat: Number(s.origen_lat), lng: Number(s.origen_lng), nombre: 'Recogida' };
  });
  readonly quienRecibe = computed(() => this.paquete()?.destinatario_nombre?.split(/\s+/)[0] ?? 'quien recibe');

  readonly aviso = computed(() => {
    const s = this.servicio();
    const m = this.minutos();
    if (!s) return 'Cargando tu envío…';
    if (s.estado_codigo === 'en_origen') return 'El conductor está recogiendo tu paquete';
    if (this.recogido()) return m != null ? `Tu paquete llega en ${m} min` : 'Tu paquete va en camino';
    return m != null ? `El conductor llega a recoger en ${m} min` : 'El conductor va por tu paquete';
  });

  readonly pasos = computed<Paso[]>(() => {
    const s = this.servicio();
    const e = s?.estado_codigo;
    const h = this.historial();
    const cuando = (estado: string) => hora(h.find((x) => x.estado_nuevo === estado)?.creado_en);
    const m = this.minutos();
    const llega = m != null ? hora(new Date(Date.now() + m * 60000).toISOString()) : null;
    return [
      {
        titulo: 'Paquete recogido',
        detalle: this.recogido() ? cuando('en_curso') : e === 'en_origen' ? 'El conductor llegó a recogerlo' : 'El conductor va por él',
        estado: this.recogido() ? 'hecho' : 'actual',
      },
      {
        titulo: `En camino a ${s?.destino_barrio ?? 'la entrega'}`,
        detalle: this.recogido() && llega ? `Llega a las ${llega}` : null,
        estado: this.recogido() ? 'actual' : 'pendiente',
      },
      { titulo: `Entregado a ${this.quienRecibe()}`, detalle: null, estado: 'pendiente' },
    ];
  });

  readonly puedeCancelar = computed(() => {
    const e = this.servicio()?.estado_codigo;
    return e === 'asignado' || e === 'en_origen';
  });
  readonly iniciales = computed(() =>
    (this.servicio()?.conductor_nombre ?? '')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join(''),
  );
  readonly telefonoConductor = computed(() => (this.servicio()?.conductor_telefono ?? '').replace(/[^\d+]/g, ''));

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
    this.envio.paquete(this.id).then((p) => this.paquete.set(p)).catch(() => undefined);
    this.revisar();
    this.sondeo = setInterval(() => this.revisar(), CADA_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.sondeo);
  }

  alInicio(): void {
    this.nav.navigateRoot('/cliente', { animationDirection: 'back' });
  }

  /** Comparte el código con quien recibe (WhatsApp o lo que tenga el celular). */
  async enviarCodigo(): Promise<void> {
    const c = this.servicio()?.codigo_entrega;
    if (!c) return;
    const texto = `Te envío un paquete por MoviFY. Cuando llegue, dale al conductor este código de entrega: ${c}`;
    if (navigator.share) {
      await navigator.share({ text: texto }).catch(() => undefined);
      return;
    }
    const tel = (this.paquete()?.destinatario_telefono ?? '').replace(/\D/g, '');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
  }

  async cancelar(): Promise<void> {
    const alerta = await this.alertas.create({
      header: '¿Cancelar el envío?',
      message: 'El conductor todavía no recoge tu paquete. Si cancelas, dejará de ir por él.',
      buttons: [
        { text: 'Seguir con el envío', role: 'cancel' },
        { text: 'Sí, cancelar', role: 'destructive' },
      ],
    });
    await alerta.present();
    if ((await alerta.onDidDismiss()).role !== 'destructive') return;
    this.cancelando.set(true);
    try {
      await this.envio.cancelar(this.id);
      clearInterval(this.sondeo);
      this.nav.navigateRoot('/cliente', { animationDirection: 'back' });
    } catch (e) {
      // Puede que justo lo haya recogido: se muestra el motivo y se sigue
      this.error.set((e as ErrorApi).message);
      this.revisar();
    } finally {
      this.cancelando.set(false);
    }
  }

  private async revisar(): Promise<void> {
    try {
      const s = await this.envio.detalle(this.id);
      const antes = this.servicio()?.estado_codigo;
      this.servicio.set(s);
      this.error.set('');
      if (antes !== s.estado_codigo) this.envio.historial(this.id).then((h) => this.historial.set(h)).catch(() => undefined);

      switch (s.estado_codigo) {
        case 'finalizado':
          clearInterval(this.sondeo);
          Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
          this.nav.navigateRoot('/cliente/encomienda/entregada', { queryParams: { id: this.id } });
          return;
        case 'cancelado':
        case 'expirado':
          clearInterval(this.sondeo);
          this.error.set('Este envío fue cancelado.');
          return;
        case 'buscando':
          // El conductor lo soltó: se vuelve a buscar otro
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

  /** Ruta del conductor a la meta; se recalcula si cambia la fase o se movió lo suficiente. */
  private async actualizarRuta(): Promise<void> {
    const desde = this.conductor();
    const meta = this.meta();
    const fase = this.servicio()!.estado_codigo;
    if (!desde || !meta) return;
    const u = this.ultimaRuta;
    if (u && u.fase === fase && distanciaKm(u.desde, desde) < RECALCULAR_KM) return;
    this.ultimaRuta = { desde, fase };
    const r = await this.lugares.ruta(desde, meta);
    this.camino.set(r.puntos);
    this.minutos.set(r.duracionMin);
  }
}
