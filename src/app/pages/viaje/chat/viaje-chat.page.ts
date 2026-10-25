import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../../core/api.service';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { hora } from '../../../servicios/encomienda.service';
import { Mensaje, ViajeActivo, ViajeActivoService, iniciales, primerNombre, telefonoLimpio } from '../../../servicios/viaje-activo.service';

type Rol = 'conductor' | 'cliente';

/** Cada cuánto se buscan mensajes nuevos con la pantalla abierta. */
const CADA_MS = 3000;
const MAX_LARGO = 500;

/** Respuestas rápidas: lo que más se escribe en una recogida (un toque y listo, sin teclear manejando). */
const RAPIDAS: Record<Rol, string[]> = {
  cliente: ['Ya salgo', 'Estoy en la esquina', 'Te espero en la puerta', 'Voy con una maleta', '¿Dónde estás?'],
  conductor: ['Ya llegué', 'Voy en camino', 'Estoy afuera', 'Hay mucho tráfico, ya voy', '¿Dónde te encuentro?'],
};

/**
 * Chat del viaje (?id=servicio), para el pasajero y el conductor (data.rol). Como Uber y DiDi:
 * se escriben sin mostrar el número de celular. Respuestas rápidas para el conductor que va manejando.
 * Solo se puede escribir mientras el servicio está activo (lo valida la base).
 */
@Component({
  selector: 'app-viaje-chat',
  templateUrl: 'viaje-chat.page.html',
  styleUrls: ['viaje-chat.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent],
})
export class ViajeChatPage implements ViewDidEnter, ViewWillLeave {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly viajes = inject(ViajeActivoService);
  private readonly contenido = viewChild(IonContent);
  private readonly campo = viewChild<ElementRef<HTMLTextAreaElement>>('campo');

  readonly rol: Rol = this.ruta.snapshot.data['rol'] === 'conductor' ? 'conductor' : 'cliente';
  readonly rapidas = RAPIDAS[this.rol];
  readonly maxLargo = MAX_LARGO;
  readonly v = signal<ViajeActivo | null>(null);
  readonly mensajes = signal<Mensaje[]>([]);
  readonly texto = signal('');
  readonly cargando = signal(true);
  readonly enviando = signal(false);
  readonly error = signal('');
  private id = 0;
  private sondeo?: ReturnType<typeof setInterval>;

  /** Con quién se habla. Si el viaje es para otra persona, el conductor ve el nombre de quien viaja. */
  readonly otro = computed(() => {
    const v = this.v();
    if (this.rol === 'cliente') return v?.conductor_nombre ?? 'Tu conductor';
    return v?.pasajero_nombre || v?.usuario_nombre || 'Pasajero';
  });
  readonly otroCorto = computed(() => primerNombre(this.otro(), this.rol === 'cliente' ? 'tu conductor' : 'el pasajero'));
  readonly inicialesOtro = computed(() => iniciales(this.otro()));
  readonly detalle = computed(() => {
    const v = this.v();
    if (!v) return '';
    if (this.rol === 'cliente') return [v.conductor_placa, v.conductor_modelo].filter(Boolean).join(' · ');
    return v.origen;
  });
  readonly activo = computed(() => ['asignado', 'en_origen', 'en_curso'].includes(this.v()?.estado_codigo ?? 'asignado'));
  readonly telefono = computed(() => telefonoLimpio(this.rol === 'cliente' ? this.v()?.conductor_telefono : this.v()?.usuario_telefono));
  readonly puedeEnviar = computed(() => !!this.texto().trim() && !this.enviando() && this.activo());
  readonly hora = hora;

  ionViewDidEnter(): void {
    this.id = Number(this.ruta.snapshot.queryParamMap.get('id'));
    if (!this.id) {
      this.volver();
      return;
    }
    this.viajes.detalle(this.id).then((v) => this.v.set(v)).catch(() => undefined);
    this.cargar(true);
    this.sondeo = setInterval(() => this.cargar(false), CADA_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.sondeo);
  }

  volver(): void {
    this.nav.back();
  }

  escribir(valor: string): void {
    this.texto.set(valor.slice(0, MAX_LARGO));
    this.error.set('');
  }

  rapida(t: string): void {
    this.enviar(t);
  }

  /** Enter envía; Shift+Enter hace salto de línea (en el PC). */
  tecla(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.enviar();
    }
  }

  async enviar(rapido?: string): Promise<void> {
    const t = (rapido ?? this.texto()).trim();
    if (!t || this.enviando() || !this.activo()) return;
    this.enviando.set(true);
    this.error.set('');
    // Se muestra de una vez (optimista); si falla, se quita y se avisa
    const temporal: Mensaje = { id: -Date.now(), mio: true, contenido: t, creado_en: new Date().toISOString(), leido_en: null };
    this.mensajes.update((l) => [...l, temporal]);
    if (!rapido) this.texto.set('');
    this.bajar();
    try {
      await this.viajes.enviarMensaje(this.id, t);
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
      await this.cargar(false);
    } catch (e) {
      this.mensajes.update((l) => l.filter((m) => m.id !== temporal.id));
      if (!rapido) this.texto.set(t);
      this.error.set((e as ErrorApi).message || 'No pudimos enviar el mensaje.');
    } finally {
      this.enviando.set(false);
      this.campo()?.nativeElement.focus();
    }
  }

  private async cargar(primera: boolean): Promise<void> {
    try {
      const l = await this.viajes.mensajes(this.id);
      const antes = this.mensajes().filter((m) => m.id > 0).length;
      this.mensajes.set(l);
      if (primera || l.length !== antes) this.bajar();
    } catch (e) {
      if (primera) this.error.set((e as ErrorApi).message || 'No pudimos cargar el chat.');
    } finally {
      this.cargando.set(false);
    }
  }

  private bajar(): void {
    setTimeout(() => this.contenido()?.scrollToBottom(200), 30);
  }
}
