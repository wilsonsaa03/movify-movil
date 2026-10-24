import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonContent, IonFooter, NavController, ToastController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../../core/api.service';
import { distancia, pesos } from '../../../core/formato';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { BotonSosComponent } from '../../../componentes/boton-sos/boton-sos.component';
import { LugaresService, distanciaKm } from '../../../servicios/lugares.service';
import { UbicacionService } from '../../../servicios/ubicacion.service';
import { ViajeActivo, ViajeActivoService, iniciales, primerNombre, telefonoLimpio } from '../../../servicios/viaje-activo.service';

const CADA_MS = 5000;
const RECALCULAR_KM = 0.1;

/**
 * Conductor app 5 · En viaje (?id=servicio).
 * Tarjeta "LLEVANDO A ANA · Muelle turístico · 8 min · 2,9 km" con barra de avance, mapa con la ruta al destino,
 * SOS, el pasajero y el valor del viaje. "Finalizar viaje" → Calificar.
 * Domicilio y encomienda: primero "Ya lo recogí" (en_origen → en_curso); al entregar, el domicilio con compra pide
 * el valor de la factura y la encomienda el código de entrega (PIN).
 */
@Component({
  selector: 'app-conductor-en-viaje',
  templateUrl: 'conductor-en-viaje.page.html',
  styleUrls: ['conductor-en-viaje.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent, BotonSosComponent],
})
export class ConductorEnViajePage implements ViewDidEnter, ViewWillLeave, AfterViewInit, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly alertas = inject(AlertController);
  private readonly avisos = inject(ToastController);
  private readonly lugares = inject(LugaresService);
  private readonly gps = inject(UbicacionService);
  private readonly viajes = inject(ViajeActivoService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;

  readonly v = signal<ViajeActivo | null>(null);
  readonly camino = signal<PuntoMapa[]>([]);
  readonly minutos = signal<number | null>(null);
  readonly falta = signal<number | null>(null);
  readonly altoHoja = signal(0);
  readonly ocupado = signal(false);
  readonly error = signal('');
  /** Domicilio con compra: lo que dice la factura. */
  readonly factura = signal<number | null>(null);
  readonly pesos = pesos;

  id = 0;
  private sondeo?: ReturnType<typeof setInterval>;
  private ultimaRuta: { desde: PuntoMapa; fase: string } | null = null;

  /** Domicilio/encomienda en la tienda o donde se recoge: todavía falta recoger. */
  readonly porRecoger = computed(() => this.v()?.estado_codigo === 'en_origen');
  readonly tipo = computed(() => this.v()?.tipo_servicio ?? 'transporte');
  readonly compra = computed(() => this.tipo() === 'domicilio' && !!this.v()?.requiere_compra);
  readonly yo = computed<PuntoMapa | null>(() => {
    const u = this.gps.ubicacion();
    return u ? { lat: u.lat, lng: u.lng } : null;
  });
  readonly meta = computed(() => {
    const v = this.v();
    if (!v) return null;
    return this.porRecoger()
      ? { lat: Number(v.origen_lat), lng: Number(v.origen_lng), nombre: v.establecimiento ?? 'Recogida' }
      : { lat: Number(v.destino_lat), lng: Number(v.destino_lng), nombre: v.destino.split(',')[0] };
  });
  readonly pasajero = computed(() => this.v()?.usuario_nombre?.trim() || 'Pasajero');
  readonly inicial = computed(() => iniciales(this.pasajero()).charAt(0));
  readonly calificacion = computed(() => {
    const c = Number(this.v()?.usuario_calificacion);
    return c ? c.toFixed(1).replace('.', ',') : null;
  });
  readonly telefono = computed(() => telefonoLimpio(this.v()?.usuario_telefono));
  /** "LLEVANDO A ANA", "LLEVANDO EL PEDIDO"… */
  readonly etiqueta = computed(() => {
    if (this.porRecoger()) return this.tipo() === 'domicilio' ? (this.compra() ? 'Compra el pedido' : 'Recoge el pedido') : 'Recoge el paquete';
    if (this.tipo() === 'domicilio') return 'Llevando el pedido';
    if (this.tipo() === 'encomienda') return 'Llevando el paquete';
    return `Llevando a ${primerNombre(this.v()?.usuario_nombre, 'tu pasajero')}`;
  });
  readonly lugar = computed(() => this.meta()?.nombre ?? '');
  /** Avance del viaje: lo recorrido sobre la distancia total. */
  readonly avance = computed(() => {
    const total = Number(this.v()?.distancia_km) || 0;
    const f = this.falta();
    if (!total || f === null || this.porRecoger()) return 0;
    return Math.max(0.04, Math.min(1, 1 - f / total));
  });
  /** Lo que cobra en efectivo al entregar. */
  readonly cobrar = computed(() => Number(this.v()?.tarifa ?? 0) + (this.compra() ? this.factura() ?? 0 : 0));
  readonly textoBoton = computed(() => {
    if (this.porRecoger()) return this.compra() ? 'Ya lo compré' : 'Ya lo recogí';
    if (this.tipo() === 'encomienda') return 'Entregar paquete';
    if (this.tipo() === 'domicilio') return 'Entregar pedido';
    return 'Finalizar viaje';
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
      this.nav.navigateRoot('/conductor/inicio');
      return;
    }
    this.viajes.empezarReporte();
    this.revisar();
    this.sondeo = setInterval(() => this.revisar(), CADA_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.sondeo);
  }

  escribirFactura(texto: string): string {
    const n = Number(texto.replace(/\D/g, '').slice(0, 9));
    this.factura.set(texto.replace(/\D/g, '') ? n : null);
    this.error.set('');
    return this.factura() !== null ? new Intl.NumberFormat('es-CO').format(n) : '';
  }

  async siguiente(): Promise<void> {
    if (this.ocupado() || !this.v()) return;
    // Domicilio/encomienda en el origen: ya tiene el pedido, sigue a la entrega
    if (this.porRecoger()) {
      await this.avanzar({ estado: 'en_curso' });
      return;
    }
    // Encomienda: se entrega con el código de quien recibe
    if (this.tipo() === 'encomienda') {
      this.nav.navigateForward('/conductor/viaje/pin', { queryParams: { id: this.id, para: 'entrega' } });
      return;
    }
    if (this.compra() && this.factura() === null) {
      this.error.set('Escribe cuánto pagaste en la tienda (lo que dice la factura).');
      return;
    }
    const alerta = await this.alertas.create({
      header: this.tipo() === 'domicilio' ? '¿Entregaste el pedido?' : '¿Terminaste el viaje?',
      message: `Cóbrale ${pesos(this.cobrar())} en efectivo.`,
      buttons: [
        { text: 'Todavía no', role: 'cancel' },
        { text: 'Sí, finalizar', role: 'confirmar' },
      ],
    });
    await alerta.present();
    if ((await alerta.onDidDismiss()).role !== 'confirmar') return;
    const ok = await this.avanzar({ estado: 'finalizado', ...(this.compra() ? { valor_compra_real: this.factura()! } : {}) });
    if (ok) {
      this.viajes.pararReporte();
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      this.nav.navigateRoot('/conductor/viaje/calificar', { queryParams: { id: this.id } });
    }
  }

  private async avanzar(a: Parameters<ViajeActivoService['avanzar']>[1]): Promise<boolean> {
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.viajes.avanzar(this.id, a);
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
      await this.revisar();
      return true;
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos actualizar el viaje. Intenta de nuevo.');
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  private async revisar(): Promise<void> {
    try {
      const v = await this.viajes.detalle(this.id);
      this.v.set(v);
      if (v.estado_codigo === 'cancelado' || v.estado_codigo === 'expirado') {
        clearInterval(this.sondeo);
        this.viajes.pararReporte();
        const t = await this.avisos.create({ message: 'El servicio fue cancelado.', duration: 3000, position: 'top', color: 'dark' });
        t.present();
        this.nav.navigateRoot('/conductor/inicio', { animationDirection: 'back' });
        return;
      }
      if (v.estado_codigo === 'finalizado') {
        clearInterval(this.sondeo);
        this.viajes.pararReporte();
        this.nav.navigateRoot('/conductor/viaje/calificar', { queryParams: { id: this.id } });
        return;
      }
      this.actualizarRuta();
    } catch (e) {
      if ((e as ErrorApi).status === 404 || (e as ErrorApi).status === 403) {
        clearInterval(this.sondeo);
        this.nav.navigateRoot('/conductor/inicio');
        return;
      }
      this.error.set('Sin conexión. Seguimos intentando…');
    }
  }

  private async actualizarRuta(): Promise<void> {
    const desde = this.yo();
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

  readonly distancia = distancia;
  readonly miles = (n: number) => new Intl.NumberFormat('es-CO').format(Number(n));
}
