import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { pesos } from '../../../../core/formato';
import { IconoComponent, NombreIcono } from '../../../../componentes/icono/icono.component';
import { DetalleServicio, ViajeService } from '../../../../servicios/viaje.service';
import { EncomiendaService } from '../../../../servicios/encomienda.service';
import { DomicilioService } from '../../../../servicios/domicilio.service';

/** Cada cuánto se pregunta si algún conductor aceptó. */
const CADA_MS = 4000;
/** Después de este tiempo sin conductor aparece "¿Ofreces un poco más?". */
const OFRECER_MAS_MS = 35000;
/** Cuánto se puede subir de un toque (en efectivo, montos redondos). */
const AUMENTOS = [1000, 2000, 3000];

type Fase = 'buscando' | 'sin-conductor' | 'error';

/** Pantalla a la que se pasa cuando un conductor acepta, según el servicio. */
const SEGUIMIENTO: Record<string, string> = {
  encomienda: '/cliente/encomienda/seguimiento',
  domicilio: '/cliente/domicilio/seguimiento',
};

/**
 * Viaje 4 · Buscando tu moto…
 * Trabaja con el id del servicio (?id=), así sobrevive a recargar la página o reabrir la app.
 * Pregunta el estado cada 4 s: cuando un conductor acepta → Viaje 5 (conductor asignado).
 * Si la búsqueda vence (expirado) ofrece intentarlo de nuevo. "Cancelar solicitud" cancela en el backend.
 */
@Component({
  selector: 'app-viaje-buscando',
  templateUrl: 'viaje-buscando.page.html',
  styleUrls: ['viaje-buscando.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent],
})
export class ViajeBuscandoPage implements ViewDidEnter, ViewWillLeave {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly alertas = inject(AlertController);
  private readonly viaje = inject(ViajeService);
  private readonly encomienda = inject(EncomiendaService);
  private readonly domicilio = inject(DomicilioService);

  readonly servicio = signal<DetalleServicio | null>(null);
  readonly fase = signal<Fase>('buscando');
  readonly cancelando = signal(false);
  readonly error = signal('');
  readonly pesos = pesos;
  /** Pasó un rato sin que nadie acepte: se ofrece subir la tarifa (inDrive / DiDi). */
  readonly ofrecerMas = signal(false);
  readonly subiendo = signal<number | null>(null);
  readonly aumentos = AUMENTOS;
  private espera?: ReturnType<typeof setTimeout>;

  /** Señal (no campo normal) para que "Les avisamos a N conductores" se recalcule al conocer el id. */
  private readonly idSenal = signal(0);
  private get id(): number {
    return this.idSenal();
  }
  private sondeo?: ReturnType<typeof setInterval>;

  readonly tipo = computed(() => this.servicio()?.tipo_vehiculo ?? this.viaje.pedido()?.tipo ?? 'moto');
  /** La misma pantalla sirve para el viaje, la encomienda y el domicilio (Figma: "Buscando…" de cada flujo). */
  readonly clase = computed<'transporte' | 'encomienda' | 'domicilio'>(() => {
    const s = this.servicio();
    if (s) return s.tipo_servicio;
    if (this.encomienda.pedido()?.id === this.id) return 'encomienda';
    if (this.domicilio.pedido()?.id === this.id) return 'domicilio';
    return 'transporte';
  });
  readonly esEncomienda = computed(() => this.clase() === 'encomienda');
  readonly esDomicilio = computed(() => this.clase() === 'domicilio');
  readonly icono = computed<NombreIcono>(() => (this.esEncomienda() ? 'encomienda' : this.esDomicilio() ? 'domicilio' : this.tipo()));
  readonly codigo = computed(() => this.servicio()?.codigo_entrega ?? (this.encomienda.pedido()?.id === this.id ? this.encomienda.pedido()!.codigo_entrega : null));
  readonly titulo = computed(() => {
    const sin = this.fase() === 'sin-conductor';
    if (this.esEncomienda()) return sin ? 'Nadie tomó tu envío' : 'Buscando quién lleve tu paquete…';
    if (this.esDomicilio()) return sin ? 'Nadie tomó tu pedido' : 'Buscando domiciliario…';
    return sin ? 'Nadie tomó tu viaje' : `Buscando tu ${this.tipo()}…`;
  });
  readonly mensaje = computed(() => {
    if (this.fase() === 'sin-conductor') return 'Los conductores cercanos están ocupados. Puedes intentarlo otra vez.';
    // En el domicilio se busca cerca de la tienda (el origen), no del cliente
    const donde = this.esDomicilio() ? 'cerca de la tienda' : 'cerca de ti';
    const p = [this.viaje.pedido(), this.encomienda.pedido(), this.domicilio.pedido()].find((x) => x?.id === this.id);
    if (p) {
      const n = Number(p.conductores_notificados) || 0;
      if (n === 0) return 'Aún no hay conductores libres cerca; seguimos buscando.';
      return n === 1 ? `Le avisamos a 1 conductor ${donde}.` : `Les avisamos a ${n} conductores ${donde}.`;
    }
    return `Les estamos avisando a los conductores ${donde}.`;
  });

  ionViewDidEnter(): void {
    this.idSenal.set(Number(this.ruta.snapshot.queryParamMap.get('id')));
    if (!this.id) {
      this.nav.navigateRoot('/cliente');
      return;
    }
    this.fase.set('buscando');
    this.ofrecerMas.set(false);
    this.revisar();
    this.sondeo = setInterval(() => this.revisar(), CADA_MS);
    this.espera = setTimeout(() => this.ofrecerMas.set(this.clase() === 'transporte'), OFRECER_MAS_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.sondeo);
    clearTimeout(this.espera);
  }

  /** Sube la tarifa sin cancelar: la búsqueda se reinicia y les llega de nuevo a los que la rechazaron. */
  async subir(extra: number): Promise<void> {
    const s = this.servicio();
    if (!s || this.subiendo() !== null) return;
    this.subiendo.set(extra);
    this.error.set('');
    try {
      const r = await this.viaje.subirTarifa(this.id, Number(s.tarifa) + extra);
      this.servicio.set({ ...s, tarifa: Number(r.tarifa), expira_busqueda_en: r.expira_busqueda_en });
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      this.ofrecerMas.set(false);
      clearTimeout(this.espera);
      this.espera = setTimeout(() => this.ofrecerMas.set(true), OFRECER_MAS_MS);
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos subir la tarifa.');
    } finally {
      this.subiendo.set(null);
    }
  }

  async cancelar(): Promise<void> {
    const alerta = await this.alertas.create({
      header: this.esEncomienda() ? '¿Cancelar el envío?' : this.esDomicilio() ? '¿Cancelar el domicilio?' : '¿Cancelar la solicitud?',
      message: this.esEncomienda()
        ? 'Dejaremos de buscar quién lleve tu paquete.'
        : this.esDomicilio()
          ? 'Dejaremos de buscarte domiciliario.'
          : 'Dejaremos de buscarte conductor.',
      buttons: [
        { text: 'Seguir buscando', role: 'cancel' },
        { text: 'Sí, cancelar', role: 'destructive' },
      ],
    });
    await alerta.present();
    const { role } = await alerta.onDidDismiss();
    if (role !== 'destructive') return;

    this.cancelando.set(true);
    try {
      await this.viaje.cancelar(this.id);
      clearInterval(this.sondeo);
      this.nav.navigateRoot('/cliente', { animationDirection: 'back' });
    } catch (e) {
      // Puede que justo un conductor lo haya aceptado: se revisa y se sigue el flujo
      this.error.set((e as ErrorApi).message);
      this.revisar();
    } finally {
      this.cancelando.set(false);
    }
  }

  /** Volver a pedir el mismo viaje (cuando nadie lo tomó), si quiere ofreciendo más. */
  otraVez(extra = 0): void {
    const s = this.servicio();
    if (!s) {
      this.nav.navigateRoot('/cliente');
      return;
    }
    if (this.esEncomienda()) {
      // La recogida queda; quién recibe y el paquete se vuelven a confirmar
      this.encomienda.origen.set({ nombre: s.origen, detalle: null, barrio: s.origen_barrio, lat: Number(s.origen_lat), lng: Number(s.origen_lng) });
      this.encomienda.destino.set({ nombre: s.destino, detalle: null, barrio: s.destino_barrio, lat: Number(s.destino_lat), lng: Number(s.destino_lng) });
      this.nav.navigateRoot('/cliente/encomienda');
      return;
    }
    if (this.esDomicilio()) {
      // La tienda y la entrega quedan; el pedido se vuelve a escribir
      this.domicilio.tienda.set({ nombre: s.origen, detalle: null, barrio: s.origen_barrio, lat: Number(s.origen_lat), lng: Number(s.origen_lng) });
      this.domicilio.entrega.set({ nombre: s.destino, detalle: null, barrio: s.destino_barrio, lat: Number(s.destino_lat), lng: Number(s.destino_lng) });
      this.nav.navigateRoot('/cliente/domicilio');
      return;
    }
    this.viaje.tipo.set(s.tipo_vehiculo);
    this.viaje.origen.set({ nombre: 'Mi ubicación', detalle: s.origen, barrio: s.origen_barrio, lat: Number(s.origen_lat), lng: Number(s.origen_lng) });
    this.viaje.destino.set({ nombre: s.destino, detalle: null, barrio: s.destino_barrio, lat: Number(s.destino_lat), lng: Number(s.destino_lng) });
    this.viaje.parada.set(
      s.parada_lat != null && s.parada_lng != null
        ? { nombre: s.parada ?? 'Parada', detalle: null, barrio: null, lat: Number(s.parada_lat), lng: Number(s.parada_lng) }
        : null,
    );
    this.viaje.referencia.set(s.origen_referencia ?? '');
    this.viaje.casco.set(!!s.necesita_casco);
    this.viaje.pasajeros.set(Number(s.pasajeros) || 1);
    this.viaje.equipaje.set(!!s.lleva_equipaje);
    this.viaje.mascota.set(!!s.lleva_mascota);
    this.viaje.ofrecido.set(extra ? Number(s.tarifa) + extra : null);
    this.nav.navigateRoot('/cliente/viaje/confirmar');
  }

  alInicio(): void {
    this.nav.navigateRoot('/cliente', { animationDirection: 'back' });
  }

  private async revisar(): Promise<void> {
    try {
      const s = await this.viaje.detalle(this.id);
      this.servicio.set(s);
      this.error.set('');
      switch (s.estado_codigo) {
        case 'buscando':
          // El backend marca "expirado" con una tarea programada; mientras tanto se respeta la hora límite
          if (s.expira_busqueda_en && new Date(s.expira_busqueda_en).getTime() < Date.now()) this.sinConductor();
          break;
        case 'asignado':
        case 'en_origen':
        case 'en_curso':
          clearInterval(this.sondeo);
          Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
          this.nav.navigateRoot(SEGUIMIENTO[s.tipo_servicio] ?? '/cliente/viaje/en-camino', { queryParams: { id: this.id } });
          break;
        case 'expirado':
          this.sinConductor();
          break;
        default: // cancelado o finalizado: no hay nada que buscar
          clearInterval(this.sondeo);
          this.nav.navigateRoot('/cliente');
      }
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

  private sinConductor(): void {
    clearInterval(this.sondeo);
    clearTimeout(this.espera);
    this.ofrecerMas.set(false);
    if (this.fase() !== 'sin-conductor') Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
    this.fase.set('sin-conductor');
  }
}
