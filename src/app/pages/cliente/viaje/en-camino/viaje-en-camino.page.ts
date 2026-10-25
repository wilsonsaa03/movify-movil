import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonContent, IonFooter, NavController, ToastController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { BotonSosComponent } from '../../../../componentes/boton-sos/boton-sos.component';
import { elegirMotivo } from '../../../../componentes/elegir-motivo';
import { LugaresService, distanciaKm } from '../../../../servicios/lugares.service';
import { hora } from '../../../../servicios/encomienda.service';
import { MOTIVOS_CLIENTE } from '../../../../servicios/viaje.service';
import { Alerta, VigilanciaViaje } from '../../../../servicios/vigilancia-viaje';
import { ViajeActivo, ViajeActivoService, iniciales, primerNombre, telefonoLimpio } from '../../../../servicios/viaje-activo.service';

const CADA_MS = 4000;
const RECALCULAR_KM = 0.1;
/** Segundos para responder "¿Todo bien?" antes de avisar a soporte. */
const PARA_RESPONDER = 30;
/** Al pasar a menos de esto de la parada, se da por hecha y la ruta sigue al destino. */
const PARADA_HECHA_KM = 0.12;

/**
 * Viaje 5 · Conductor asignado y Viaje 6 · En viaje (?id=servicio), según el estado.
 * Antes de subir: "Carlos llega en 3 min", el conductor con su vehículo (foto, color, placa, casco), TU PIN DE VIAJE,
 * Mensaje (chat sin número) / Llamar / Compartir en vivo, cambiar destino y cancelar con motivo. Cuando llega,
 * cuánto te espera. En el viaje: "Llegas a las 6:42 p. m.", SOS 123, "¿Todo bien?" si hay desvío o parada larga
 * y "Compartir mi viaje". Al terminar → Calificar.
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
  private readonly avisos = inject(ToastController);
  private readonly lugares = inject(LugaresService);
  private readonly viajes = inject(ViajeActivoService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private readonly sos = viewChild(BotonSosComponent);
  private medidor?: ResizeObserver;

  readonly v = signal<ViajeActivo | null>(null);
  readonly camino = signal<PuntoMapa[]>([]);
  readonly minutos = signal<number | null>(null);
  readonly falta = signal<number | null>(null);
  readonly altoHoja = signal(0);
  readonly cancelando = signal(false);
  readonly compartiendo = signal(false);
  readonly error = signal('');
  readonly foto = signal<string | null>(null);
  /** Reloj de la pantalla (cuenta regresiva de la espera y de "¿Todo bien?"). */
  readonly ahora = signal(Date.now());
  readonly paradaHecha = signal(false);
  /** "¿Todo bien?" abierto: qué pasó y cuántos segundos quedan para responder. */
  readonly pregunta = signal<{ tipo: Alerta; restante: number } | null>(null);

  id = 0;
  private sondeo?: ReturnType<typeof setInterval>;
  private reloj?: ReturnType<typeof setInterval>;
  private ultimaRuta: { desde: PuntoMapa; fase: string; destino: string } | null = null;
  private vigilancia: VigilanciaViaje | null = null;
  private fotoPedida = false;

  readonly enViaje = computed(() => this.v()?.estado_codigo === 'en_curso');
  readonly llego = computed(() => this.v()?.estado_codigo === 'en_origen');
  readonly conductor = computed(() => this.v()?.conductor_nombre ?? 'Tu conductor');
  readonly corto = computed(() => primerNombre(this.v()?.conductor_nombre, 'Tu conductor'));
  readonly iniciales = computed(() => iniciales(this.v()?.conductor_nombre));
  readonly telefono = computed(() => telefonoLimpio(this.v()?.conductor_telefono));
  readonly pin = computed(() => (this.v()?.codigo_abordaje ?? '').split(''));
  readonly sinLeer = computed(() => Number(this.v()?.mensajes_sin_leer) || 0);
  readonly vehiculo = computed<PuntoMapa | null>(() => {
    const v = this.v();
    return v?.conductor_lat != null && v.conductor_lng != null ? { lat: Number(v.conductor_lat), lng: Number(v.conductor_lng) } : null;
  });
  readonly parada = computed<PuntoMapa | null>(() => {
    const v = this.v();
    return v?.parada_lat != null && v.parada_lng != null ? { lat: Number(v.parada_lat), lng: Number(v.parada_lng) } : null;
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
  /** "Te espera hasta las 6:42 p. m. · 3:58" (DiDi y Uber muestran cuánto espera el conductor). */
  readonly espera = computed(() => {
    const hasta = this.v()?.espera_hasta;
    if (!this.llego() || !hasta) return null;
    const ms = new Date(hasta).getTime() - this.ahora();
    if (ms <= 0) return { vencida: true, texto: 'Ya pasó el tiempo de espera: sal pronto o escríbele' };
    const s = Math.ceil(ms / 1000);
    return { vencida: false, texto: `Te espera hasta las ${hora(hasta)}`, reloj: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };
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
  /** "Yamaha FZ · Negro" y un punto del color del vehículo (más fácil de reconocer que la placa de lejos). */
  readonly modelo = computed(() => {
    const v = this.v();
    return [v?.conductor_modelo, v?.conductor_color].filter(Boolean).join(' · ');
  });
  readonly colorVehiculo = computed(() => colorCss(this.v()?.conductor_color));
  /** Pidió casco y la moto lo lleva. */
  readonly conCasco = computed(() => this.v()?.tipo_vehiculo === 'moto' && !!this.v()?.necesita_casco && !!this.v()?.conductor_casco);

  ngAfterViewInit(): void {
    this.medidor = new ResizeObserver(() => this.altoHoja.set(this.hojaRef().nativeElement.offsetHeight));
    this.medidor.observe(this.hojaRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.medidor?.disconnect();
    clearInterval(this.sondeo);
    clearInterval(this.reloj);
    this.soltarFoto();
  }

  ionViewDidEnter(): void {
    this.id = Number(this.ruta.snapshot.queryParamMap.get('id'));
    if (!this.id) {
      this.nav.navigateRoot('/cliente');
      return;
    }
    this.revisar();
    this.sondeo = setInterval(() => this.revisar(), CADA_MS);
    this.reloj = setInterval(() => this.tic(), 1000);
  }

  ionViewWillLeave(): void {
    clearInterval(this.sondeo);
    clearInterval(this.reloj);
  }

  alInicio(): void {
    this.nav.navigateRoot('/cliente', { animationDirection: 'back' });
  }

  chat(): void {
    this.nav.navigateForward('/cliente/viaje/chat', { queryParams: { id: this.id } });
  }

  cambiarDestino(): void {
    this.nav.navigateForward('/cliente/viaje/destino', { queryParams: { cambiar: this.id } });
  }

  /**
   * Compartir en vivo: un enlace que la familia abre en el navegador y ve el carro moverse (sin cuenta).
   * Si el enlace falla (sin internet), se comparte el texto con el conductor y la placa.
   */
  async compartir(): Promise<void> {
    const v = this.v();
    if (!v || this.compartiendo()) return;
    this.compartiendo.set(true);
    const partes = [
      `Voy en un ${v.tipo_vehiculo} de MoviFY con ${this.conductor()}`,
      v.conductor_placa ? `placa ${v.conductor_placa}` : '',
      `hacia ${v.destino.split(',')[0]}`,
      this.enViaje() && this.llegasA() ? `llego a las ${this.llegasA()}` : '',
    ].filter(Boolean);
    let texto = partes.join(', ') + '.';
    try {
      const c = await this.viajes.compartir(this.id);
      texto += ` Sígueme en vivo: ${c.url}`;
    } catch {
      /* sin enlace: se comparte solo el texto */
    } finally {
      this.compartiendo.set(false);
    }
    if (navigator.share) {
      await navigator.share({ text: texto }).catch(() => undefined);
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }

  async cancelar(): Promise<void> {
    const motivo = await elegirMotivo(
      this.alertas,
      '¿Por qué cancelas?',
      `${this.corto()} ya va en camino. Tu respuesta nos ayuda a mejorar.`,
      MOTIVOS_CLIENTE,
      'Seguir con el viaje',
    );
    if (motivo === null) return;
    this.cancelando.set(true);
    try {
      await this.viajes.cancelar(this.id, motivo);
      clearInterval(this.sondeo);
      this.alInicio();
    } catch (e) {
      this.error.set((e as ErrorApi).message);
      this.revisar();
    } finally {
      this.cancelando.set(false);
    }
  }

  // ---------- ¿Todo bien? ----------

  async estoyBien(): Promise<void> {
    const p = this.pregunta();
    if (!p) return;
    this.pregunta.set(null);
    await this.responder(p.tipo, 'estoy_bien');
  }

  /** Abre el SOS (confirmación, aviso a soporte con la ubicación y llamar al 123). */
  async necesitoAyuda(): Promise<void> {
    const p = this.pregunta();
    if (!p) return;
    this.pregunta.set(null);
    this.responder(p.tipo, 'sos');
    await this.sos()?.pedirAyuda();
  }

  private async responder(tipo: Alerta, respuesta: 'estoy_bien' | 'sos' | 'sin_respuesta'): Promise<void> {
    const p = this.vehiculo();
    try {
      await this.viajes.alerta(this.id, tipo, respuesta, p?.lat ?? null, p?.lng ?? null);
    } catch {
      /* si falla, el SOS sigue disponible arriba */
    }
  }

  private tic(): void {
    this.ahora.set(Date.now());
    const p = this.pregunta();
    if (!p) return;
    if (p.restante <= 1) {
      // No respondió: se le avisa a soporte para que revise el viaje
      this.pregunta.set(null);
      this.responder(p.tipo, 'sin_respuesta');
      this.mostrar('No respondiste: le avisamos a soporte de MoviFY para que revise tu viaje.');
      return;
    }
    this.pregunta.set({ ...p, restante: p.restante - 1 });
  }

  private async revisar(): Promise<void> {
    try {
      const v = await this.viajes.detalle(this.id);
      const antes = this.v()?.estado_codigo;
      const mensajesAntes = Number(this.v()?.mensajes_sin_leer) || 0;
      this.v.set(v);
      this.error.set('');
      if (antes && antes !== v.estado_codigo) Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      if (antes && (Number(v.mensajes_sin_leer) || 0) > mensajesAntes) {
        Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
        this.mostrar(`${this.corto()} te escribió`, true);
      }
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
      if (v.conductor_vehiculo_foto && !this.fotoPedida) {
        this.fotoPedida = true;
        this.viajes.fotoVehiculo(this.id).then((b) => this.foto.set(URL.createObjectURL(b))).catch(() => undefined);
      }
      this.vigilar();
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

  /** En el viaje: desvío o parada larga → "¿Todo bien?". */
  private vigilar(): void {
    const p = this.vehiculo();
    if (!this.enViaje() || !p || !this.vigilancia) return;
    const parada = this.parada();
    if (parada && !this.paradaHecha() && distanciaKm(p, parada) < PARADA_HECHA_KM) this.paradaHecha.set(true);
    if (this.pregunta()) return;
    const alerta = this.vigilancia.registrar(p, Date.now());
    if (alerta) {
      Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
      this.pregunta.set({ tipo: alerta, restante: PARA_RESPONDER });
    }
  }

  private async actualizarRuta(): Promise<void> {
    const desde = this.vehiculo();
    const meta = this.meta();
    const v = this.v();
    const fase = v?.estado_codigo ?? '';
    if (!desde || !meta || !v) return;
    // Cambió el destino (lo cambió el pasajero) → se vuelve a planear todo
    const destino = `${v.destino_lat},${v.destino_lng},${v.parada_lat ?? ''}`;
    const u = this.ultimaRuta;
    if (u && u.fase === fase && u.destino === destino && distanciaKm(u.desde, desde) < RECALCULAR_KM) return;
    const replanear = !u || u.fase !== fase || u.destino !== destino;
    this.ultimaRuta = { desde, fase, destino };
    const parada = this.enViaje() && !this.paradaHecha() ? this.parada() : null;
    const r = await this.lugares.ruta(desde, meta, parada);
    this.camino.set(r.puntos);
    this.minutos.set(r.duracionMin);
    this.falta.set(r.distanciaKm);
    if (this.enViaje() && replanear) {
      const metas = [meta, ...(this.parada() ? [this.parada()!] : [])];
      if (this.vigilancia) this.vigilancia.replanear(r.puntos, metas);
      else this.vigilancia = new VigilanciaViaje(r.puntos, metas);
    }
  }

  private async mostrar(mensaje: string, conChat = false): Promise<void> {
    const t = await this.avisos.create({
      message: mensaje,
      duration: 4000,
      position: 'top',
      color: 'dark',
      buttons: conChat ? [{ text: 'Ver', handler: () => this.chat() }] : undefined,
    });
    await t.present();
  }

  private soltarFoto(): void {
    const f = this.foto();
    if (f) URL.revokeObjectURL(f);
    this.foto.set(null);
    this.fotoPedida = false;
  }
}

/** "Negro", "Blanca", "Amarillo"… → un color para el punto junto al modelo (null si no se reconoce). */
export function colorCss(nombre: string | null | undefined): string | null {
  const n = (nombre ?? '').toLowerCase();
  const colores: [string, string][] = [
    ['negr', '#1d232b'],
    ['blanc', '#ffffff'],
    ['gris', '#8a97a6'],
    ['plat', '#c3ccd6'],
    ['roj', '#d93b3b'],
    ['azul', '#2f6fd6'],
    ['amarill', '#ffc94d'],
    ['verde', '#2e9d5b'],
    ['naranj', '#fe7b13'],
    ['vinotinto', '#7a1f2b'],
    ['café', '#7a5232'],
    ['cafe', '#7a5232'],
    ['morad', '#7b4fc9'],
  ];
  return colores.find(([k]) => n.includes(k))?.[1] ?? null;
}
