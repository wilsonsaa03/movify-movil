import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { BotonSosComponent } from '../../../../componentes/boton-sos/boton-sos.component';
import { LugaresService, distanciaKm } from '../../../../servicios/lugares.service';
import { hora } from '../../../../servicios/encomienda.service';
import { ViajeActivo, ViajeActivoService, iniciales, primerNombre, telefonoLimpio } from '../../../../servicios/viaje-activo.service';

const CADA_MS = 4000;
const RECALCULAR_KM = 0.1;

/**
 * Viaje 5 · Conductor asignado y Viaje 6 · En viaje (?id=servicio), según el estado.
 * Antes de subir: "Carlos llega en 3 min", el conductor con su placa, TU PIN DE VIAJE (se lo dice al conductor
 * para empezar), Llamar / Mensaje / Compartir y Cancelar. En el viaje: "Llegas a las 6:42 p. m." con barra de
 * avance, SOS 123 y "Compartir mi viaje". Al terminar → Calificar.
 */
@Component({
  selector: 'app-viaje-en-camino',
  templateUrl: 'viaje-en-camino.page.html',
  styleUrls: ['viaje-en-camino.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent, BotonSosComponent],
})
export class ViajeEnCaminoPage implements ViewDidEnter, ViewWillLeave, AfterViewInit, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly alertas = inject(AlertController);
  private readonly lugares = inject(LugaresService);
  private readonly viajes = inject(ViajeActivoService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;

  readonly v = signal<ViajeActivo | null>(null);
  readonly camino = signal<PuntoMapa[]>([]);
  readonly minutos = signal<number | null>(null);
  readonly falta = signal<number | null>(null);
  readonly altoHoja = signal(0);
  readonly cancelando = signal(false);
  readonly error = signal('');

  id = 0;
  private sondeo?: ReturnType<typeof setInterval>;
  private ultimaRuta: { desde: PuntoMapa; fase: string } | null = null;

  readonly enViaje = computed(() => this.v()?.estado_codigo === 'en_curso');
  readonly llego = computed(() => this.v()?.estado_codigo === 'en_origen');
  readonly conductor = computed(() => this.v()?.conductor_nombre ?? 'Tu conductor');
  readonly corto = computed(() => primerNombre(this.v()?.conductor_nombre, 'Tu conductor'));
  readonly iniciales = computed(() => iniciales(this.v()?.conductor_nombre));
  readonly telefono = computed(() => telefonoLimpio(this.v()?.conductor_telefono));
  readonly pin = computed(() => (this.v()?.codigo_abordaje ?? '').split(''));
  readonly vehiculo = computed<PuntoMapa | null>(() => {
    const v = this.v();
    return v?.conductor_lat != null && v.conductor_lng != null ? { lat: Number(v.conductor_lat), lng: Number(v.conductor_lng) } : null;
  });
  readonly meta = computed(() => {
    const v = this.v();
    if (!v) return null;
    return this.enViaje()
      ? { lat: Number(v.destino_lat), lng: Number(v.destino_lng), nombre: v.destino.split(',')[0] }
      : { lat: Number(v.origen_lat), lng: Number(v.origen_lng), nombre: 'Tú' };
  });
  readonly aviso = computed(() => {
    if (this.llego()) return `${this.corto()} llegó · te está esperando`;
    const m = this.minutos();
    return m !== null ? `${this.corto()} llega en ${m} min` : `${this.corto()} va por ti`;
  });
  readonly llegasA = computed(() => {
    const m = this.minutos();
    return m !== null ? hora(new Date(Date.now() + m * 60000).toISOString()) : null;
  });
  readonly avance = computed(() => {
    const total = Number(this.v()?.distancia_km) || 0;
    const f = this.falta();
    if (!total || f === null) return 0;
    return Math.max(0.04, Math.min(1, 1 - f / total));
  });
  readonly calificacion = computed(() => {
    const c = Number(this.v()?.conductor_calificacion);
    return c ? c.toFixed(1).replace('.', ',') : null;
  });

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

  /** Comparte el viaje (conductor, placa y hora de llegada) con la familia. */
  async compartir(): Promise<void> {
    const v = this.v();
    if (!v) return;
    const partes = [
      `Voy en un ${v.tipo_vehiculo} de MoviFY con ${this.conductor()}`,
      v.conductor_placa ? `placa ${v.conductor_placa}` : '',
      `hacia ${v.destino}`,
      this.enViaje() && this.llegasA() ? `llego a las ${this.llegasA()}` : '',
    ].filter(Boolean);
    const texto = partes.join(', ') + '.';
    if (navigator.share) {
      await navigator.share({ text: texto }).catch(() => undefined);
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }

  async cancelar(): Promise<void> {
    const alerta = await this.alertas.create({
      header: '¿Cancelar el viaje?',
      message: `${this.corto()} ya va en camino. Si cancelas, dejará de ir por ti.`,
      buttons: [
        { text: 'Seguir con el viaje', role: 'cancel' },
        { text: 'Sí, cancelar', role: 'destructive' },
      ],
    });
    await alerta.present();
    if ((await alerta.onDidDismiss()).role !== 'destructive') return;
    this.cancelando.set(true);
    try {
      await this.viajes.cancelar(this.id);
      clearInterval(this.sondeo);
      this.alInicio();
    } catch (e) {
      this.error.set((e as ErrorApi).message);
      this.revisar();
    } finally {
      this.cancelando.set(false);
    }
  }

  private async revisar(): Promise<void> {
    try {
      const v = await this.viajes.detalle(this.id);
      const antes = this.v()?.estado_codigo;
      this.v.set(v);
      this.error.set('');
      if (antes && antes !== v.estado_codigo) Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      switch (v.estado_codigo) {
        case 'finalizado':
          clearInterval(this.sondeo);
          this.nav.navigateRoot('/cliente/viaje/calificar', { queryParams: { id: this.id } });
          return;
        case 'cancelado':
        case 'expirado':
          clearInterval(this.sondeo);
          this.error.set('El viaje fue cancelado.');
          return;
        case 'buscando':
          // El conductor lo soltó: se busca otro
          clearInterval(this.sondeo);
          this.nav.navigateRoot('/cliente/viaje/buscando', { queryParams: { id: this.id } });
          return;
      }
      this.actualizarRuta();
    } catch (e) {
      const err = e as ErrorApi;
      if (err.status === 404 || err.status === 403) {
        clearInterval(this.sondeo);
        this.alInicio();
        return;
      }
      this.error.set('Sin conexión. Seguimos intentando…');
    }
  }

  private async actualizarRuta(): Promise<void> {
    const desde = this.vehiculo();
    const meta = this.meta();
    const fase = this.v()?.estado_codigo ?? '';
    if (!desde || !meta) return;
    const u = this.ultimaRuta;
    if (u && u.fase === fase && distanciaKm(u.desde, desde) < RECALCULAR_KM) return;
    this.ultimaRuta = { desde, fase };
    const r = await this.lugares.ruta(desde, meta);
    this.camino.set(r.puntos);
    this.minutos.set(r.duracionMin);
    this.falta.set(r.distanciaKm);
  }
}
