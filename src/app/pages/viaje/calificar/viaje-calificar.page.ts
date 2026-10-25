import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService, ErrorApi } from '../../../core/api.service';
import { pesos } from '../../../core/formato';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { hora } from '../../../servicios/encomienda.service';
import { ViajeActivo, ViajeActivoService, iniciales, primerNombre } from '../../../servicios/viaje-activo.service';

type Rol = 'conductor' | 'cliente';

/** "¿Qué te gustó?" (Figma: Conductor app 7 · Calificar y Viaje 8 · Calificar). */
const ETIQUETAS: Record<Rol, string[]> = {
  conductor: ['Buena conducta', 'Muy amable', 'Dio indicaciones precisas', 'Pagó completo', 'Conoce la zona'],
  cliente: ['Manejó con cuidado', 'Muy amable', 'Llegó rápido', 'Conoce la zona'],
};

/**
 * ¡Llegaste! · Calificar (?id=servicio). La usan el conductor (califica al pasajero) y el pasajero
 * (califica al conductor); el rol viene en la ruta. Estrellas, "¿Qué te gustó?" y un comentario opcional.
 */
@Component({
  selector: 'app-viaje-calificar',
  templateUrl: 'viaje-calificar.page.html',
  styleUrls: ['viaje-calificar.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent],
})
export class ViajeCalificarPage implements ViewDidEnter {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly viajes = inject(ViajeActivoService);

  readonly rol: Rol = this.ruta.snapshot.data['rol'] === 'cliente' ? 'cliente' : 'conductor';
  readonly v = signal<ViajeActivo | null>(null);
  readonly cuando = signal('');
  readonly estrellas = signal(0);
  readonly elegidas = signal<string[]>([]);
  readonly comentario = signal('');
  readonly enviando = signal(false);
  readonly listo = signal(false);
  readonly error = signal('');
  /** Pasajero: con 4–5 estrellas puede guardar al conductor en favoritos; con 1–2, no volver a emparejarse. */
  readonly favorito = signal(false);
  readonly bloquear = signal(false);
  readonly pesos = pesos;
  private id = 0;

  readonly ofrecerFavorito = computed(() => this.rol === 'cliente' && this.estrellas() >= 4 && !this.v()?.es_favorito);
  readonly ofrecerBloqueo = computed(() => this.rol === 'cliente' && this.estrellas() > 0 && this.estrellas() <= 2);
  /** Recibo: lo que pagó en efectivo, cuánto recorrió y cuánto duró. */
  readonly recibo = computed(() => {
    const v = this.v();
    if (!v || this.rol !== 'cliente') return null;
    const km = Number(v.distancia_km) || 0;
    return {
      valor: Number(v.valor_final ?? v.tarifa ?? 0),
      detalle: [km ? `${km.toFixed(1).replace('.', ',')} km` : '', v.duracion_estimada_min ? `${v.duracion_estimada_min} min aprox.` : '']
        .filter(Boolean)
        .join(' · '),
      origen: v.origen.split(',')[0],
      destino: v.destino.split(',')[0],
      parada: v.parada ? v.parada.split(',')[0] : null,
    };
  });

  readonly etiquetas = computed(() => {
    const base = ETIQUETAS[this.rol];
    // En moto, el pasajero agradece el casco (como en el Figma)
    if (this.rol === 'cliente' && this.v()?.tipo_vehiculo === 'moto') return [...base.slice(0, 3), 'Me prestó casco', base[3]];
    if (this.rol === 'cliente') return [...base.slice(0, 3), 'Carro limpio', base[3]];
    return base;
  });
  /** A quién se califica: el pasajero (si soy conductor) o el conductor (si soy pasajero). */
  readonly otro = computed(() => (this.rol === 'conductor' ? this.v()?.usuario_nombre : this.v()?.conductor_nombre) ?? '');
  readonly otroCorto = computed(() => primerNombre(this.otro(), this.rol === 'conductor' ? 'tu pasajero' : 'tu conductor'));
  readonly inicialesOtro = computed(() => iniciales(this.otro()));
  readonly resumen = computed(() => {
    const v = this.v();
    if (!v) return '';
    const destino = v.destino.split(',')[0];
    const valor = pesos(Number(v.valor_final ?? v.tarifa ?? 0));
    return [destino, this.cuando(), valor].filter(Boolean).join(' · ');
  });

  ionViewDidEnter(): void {
    this.id = Number(this.ruta.snapshot.queryParamMap.get('id'));
    if (!this.id) {
      this.alInicio();
      return;
    }
    this.viajes.detalle(this.id).then((v) => this.v.set(v)).catch(() => undefined);
    this.api
      .get<{ creado_en: string; estado_nuevo: string }[]>(`/servicios/${this.id}/historial`)
      .then((h) => this.cuando.set(hora(h.find((x) => x.estado_nuevo === 'finalizado')?.creado_en)))
      .catch(() => undefined);
  }

  calificar(n: number): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.estrellas.set(n);
  }

  alternar(e: string): void {
    this.elegidas.update((l) => (l.includes(e) ? l.filter((x) => x !== e) : [...l, e]));
  }

  async enviar(): Promise<void> {
    if (!this.estrellas() || this.enviando()) return;
    this.enviando.set(true);
    this.error.set('');
    // Lo que le gustó va primero en el comentario ("Muy amable, Pagó completo. Todo bien")
    const texto = [this.elegidas().join(', '), this.comentario().trim()].filter(Boolean).join('. ').slice(0, 300);
    try {
      await this.viajes.calificar(this.id, this.estrellas(), texto || null);
      // Favorito o bloqueo: si fallan, la calificación ya quedó (no se le muestra error por eso)
      if (this.ofrecerFavorito() && this.favorito()) await this.viajes.favorito(this.id, true).catch(() => undefined);
      if (this.ofrecerBloqueo() && this.bloquear()) await this.viajes.bloquear(this.id, texto || null).catch(() => undefined);
      this.listo.set(true);
      setTimeout(() => this.alInicio(), 900);
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos guardar tu calificación.');
    } finally {
      this.enviando.set(false);
    }
  }

  alInicio(): void {
    this.nav.navigateRoot(this.rol === 'conductor' ? '/conductor/inicio' : '/cliente', { animationDirection: 'back' });
  }

  reportar(): void {
    this.nav.navigateForward(this.rol === 'conductor' ? '/conductor/reportar' : '/cliente/reportes', { queryParams: { servicio: this.id } });
  }
}
