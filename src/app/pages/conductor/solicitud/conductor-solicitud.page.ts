import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ToastController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { ApiService, ErrorApi } from '../../../core/api.service';
import { distancia, pesos } from '../../../core/formato';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { NotaVozComponent } from '../../../componentes/nota-voz/nota-voz.component';
import { LugaresService, distanciaKm } from '../../../servicios/lugares.service';
import { UbicacionService } from '../../../servicios/ubicacion.service';
import { DetalleServicio, ViajeService } from '../../../servicios/viaje.service';

/** Segundos que tiene el conductor para decidir (como en el Figma, el círculo naranja se va vaciando). */
const PARA_DECIDIR = 20;
/** Velocidad promedio en la ciudad para "A 600 m de ti · 3 min". */
const MIN_POR_KM = 3;

/**
 * Conductor app 2 · Nueva solicitud.
 * Llega desde el inicio del conductor con ?id= (GET /api/servicios/disponibles). Muestra la ruta del viaje,
 * lo que se gana, a qué distancia está el pasajero, su punto de referencia y nota de voz, y su calificación.
 * Aceptar → POST estado "asignado" (si otro conductor lo tomó primero, el backend responde error).
 * Rechazar, o dejar que se acabe el tiempo → POST estado "rechazar" y vuelve al inicio.
 */
@Component({
  selector: 'app-conductor-solicitud',
  templateUrl: 'conductor-solicitud.page.html',
  styleUrls: ['conductor-solicitud.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent, NotaVozComponent],
})
export class ConductorSolicitudPage implements ViewDidEnter, ViewWillLeave, AfterViewInit, OnDestroy {
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;
  /** Lo que tapa la hoja sobre el mapa: la ruta se encuadra en lo que queda visible. */
  readonly altoHoja = signal(0);

  private readonly nav = inject(NavController);
  private readonly rutaActiva = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly avisos = inject(ToastController);
  private readonly viaje = inject(ViajeService);
  private readonly lugares = inject(LugaresService);
  private readonly gps = inject(UbicacionService);

  readonly s = signal<DetalleServicio | null>(null);
  readonly ruta = signal<PuntoMapa[]>([]);
  readonly notaUrl = signal<string | null>(null);
  readonly restante = signal(PARA_DECIDIR);
  readonly total = signal(PARA_DECIDIR);
  readonly ocupado = signal<'aceptar' | 'rechazar' | null>(null);
  readonly pesos = pesos;

  private id = 0;
  private reloj?: ReturnType<typeof setInterval>;
  private cerrada = false;

  readonly origen = computed<PuntoMapa | null>(() => {
    const s = this.s();
    return s ? { lat: Number(s.origen_lat), lng: Number(s.origen_lng) } : null;
  });
  readonly destino = computed(() => {
    const s = this.s();
    return s ? { lat: Number(s.destino_lat), lng: Number(s.destino_lng), nombre: s.destino.split(',')[0] } : null;
  });

  /** "4,2 km · 12 min · precio fijo" */
  readonly resumen = computed(() => {
    const s = this.s();
    return s ? `${distancia(Number(s.distancia_km))} · ${s.duracion_estimada_min} min · precio fijo` : '';
  });

  /** "A 600 m de ti · 3 min" (en línea recta desde el GPS del conductor). */
  readonly cercania = computed(() => {
    const u = this.gps.ubicacion();
    const o = this.origen();
    if (!u || !o) return null;
    const km = distanciaKm(u, o) * 1.3;
    return `A ${distancia(km)} de ti · ${Math.max(1, Math.round(km * MIN_POR_KM))} min`;
  });

  readonly destinoNombre = computed(() => this.s()?.destino.split(',')[0] ?? '');
  readonly destinoDetalle = computed(() => {
    const s = this.s();
    if (!s) return '';
    const resto = s.destino.split(',').slice(1).join(',').trim();
    return [resto, s.destino_barrio].filter(Boolean).join(', ');
  });

  readonly pasajero = computed(() => this.s()?.usuario_nombre?.trim() || 'Pasajero');
  readonly inicial = computed(() => this.pasajero().charAt(0).toUpperCase());
  readonly calificacion = computed(() => {
    const c = Number(this.s()?.usuario_calificacion);
    return c ? c.toFixed(1).replace('.', ',') : null;
  });

  /** Para el círculo de la cuenta regresiva (0 = vacío, 1 = lleno). */
  readonly fraccion = computed(() => this.restante() / this.total());

  ngAfterViewInit(): void {
    this.medidor = new ResizeObserver(() => this.altoHoja.set(this.hojaRef().nativeElement.offsetHeight));
    this.medidor.observe(this.hojaRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.medidor?.disconnect();
    clearInterval(this.reloj);
  }

  ionViewDidEnter(): void {
    this.id = Number(this.rutaActiva.snapshot.queryParamMap.get('id'));
    this.cerrada = false;
    if (!this.id) {
      this.nav.navigateRoot('/conductor/inicio');
      return;
    }
    this.gps.seguir();
    Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
    this.cargar();
  }

  ionViewWillLeave(): void {
    clearInterval(this.reloj);
    this.gps.dejarDeSeguir();
    const url = this.notaUrl();
    if (url) URL.revokeObjectURL(url);
    this.notaUrl.set(null);
  }

  async aceptar(): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set('aceptar');
    try {
      await this.api.post(`/servicios/${this.id}/estado`, { estado: 'asignado' });
      this.cerrar();
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      // Raíz: aceptado el viaje, "atrás" ya no debe volver a la solicitud
      this.nav.navigateRoot('/conductor/viaje/recogida', { queryParams: { id: this.id } });
    } catch (e) {
      this.cerrar();
      await this.salir((e as ErrorApi).message || 'No se pudo aceptar el viaje.');
    } finally {
      this.ocupado.set(null);
    }
  }

  async rechazar(motivo?: string): Promise<void> {
    if (this.ocupado() || this.cerrada) return;
    this.ocupado.set('rechazar');
    this.cerrar();
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    // Aunque falle (sin señal), el conductor vuelve a su inicio: la oferta vence sola en el backend
    await this.api.post(`/servicios/${this.id}/estado`, { estado: 'rechazar' }).catch(() => undefined);
    this.ocupado.set(null);
    await this.salir(motivo);
  }

  private async cargar(): Promise<void> {
    let s: DetalleServicio;
    try {
      s = await this.viaje.detalle(this.id);
    } catch {
      await this.salir('Esta solicitud ya no está disponible.');
      return;
    }
    if (s.estado_codigo !== 'buscando') {
      await this.salir(s.estado_codigo === 'cancelado' ? 'El pasajero canceló la solicitud.' : 'Otro conductor ya tomó este viaje.');
      return;
    }
    this.s.set(s);
    this.empezarCuenta(s.expira_busqueda_en);

    this.lugares
      .ruta({ lat: Number(s.origen_lat), lng: Number(s.origen_lng) }, { lat: Number(s.destino_lat), lng: Number(s.destino_lng) })
      .then((r) => this.ruta.set(r.puntos));
    if (Number(s.nota_voz_segundos) > 0) {
      this.api
        .blob(`/servicios/${this.id}/nota-voz`)
        .then((b) => this.notaUrl.set(URL.createObjectURL(b)))
        .catch(() => undefined);
    }
  }

  /** La cuenta va hasta PARA_DECIDIR o hasta que venza la búsqueda en el backend, lo que llegue primero. */
  private empezarCuenta(expira: string | null): void {
    const hastaVencer = expira ? Math.floor((new Date(expira).getTime() - Date.now()) / 1000) : PARA_DECIDIR;
    const segundos = Math.max(5, Math.min(PARA_DECIDIR, hastaVencer));
    this.total.set(segundos);
    this.restante.set(segundos);
    const fin = Date.now() + segundos * 1000;
    clearInterval(this.reloj);
    this.reloj = setInterval(() => {
      const r = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
      this.restante.set(r);
      if (r === 0) this.rechazar('Se acabó el tiempo para responder la solicitud.');
    }, 250);
  }

  private cerrar(): void {
    this.cerrada = true;
    clearInterval(this.reloj);
  }

  private async salir(mensaje?: string): Promise<void> {
    this.cerrar();
    if (mensaje) {
      const t = await this.avisos.create({ message: mensaje, duration: 2500, position: 'top', color: 'dark' });
      t.present();
    }
    this.nav.navigateRoot('/conductor/inicio', { animationDirection: 'back' });
  }
}
