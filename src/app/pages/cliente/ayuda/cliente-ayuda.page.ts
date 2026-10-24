import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, NavController, ToastController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../../core/api.service';
import { pesos } from '../../../core/formato';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { HistorialService, Pedido, fechaHora, iconoServicio, nombreServicio } from '../../../servicios/historial.service';
import { Solicitud, SoporteService, TIPOS_SOLICITUD, TipoSolicitud, nombreTipo, numeroSolicitud } from '../../../servicios/soporte.service';

/** Cuántos servicios recientes se ofrecen para relacionar con la solicitud. */
const SERVICIOS_RECIENTES = 5;

/**
 * Ayuda (como "Ayuda" del perfil de Uber). Sin frame en el Figma: sigue el estilo de la app del cliente.
 * 1) ¿En qué te ayudamos? → tipo (olvidé algo, me cobraron mal, seguridad, queja…), el servicio al que se
 *    refiere (opcional), asunto y descripción → POST /api/pqrs → "Recibimos tu reporte".
 * 2) Mis solicitudes (GET /api/pqrs) con el estado y la respuesta del equipo; si ya respondieron,
 *    "¿Te sirvió?" la cierra o la reabre (POST /api/pqrs/{id}/cerrar|reabrir).
 * Con ?servicio=42 deja ese servicio elegido. `data.enviado` es la pantalla de confirmación.
 */
@Component({
  selector: 'app-cliente-ayuda',
  templateUrl: 'cliente-ayuda.page.html',
  styleUrls: ['cliente-ayuda.page.scss'],
  imports: [IonContent, IconoComponent],
})
export class ClienteAyudaPage implements ViewDidEnter {
  private readonly soporte = inject(SoporteService);
  private readonly historial = inject(HistorialService);
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly avisos = inject(ToastController);

  readonly tipos = TIPOS_SOLICITUD;
  readonly nombreTipo = nombreTipo;
  readonly numero = numeroSolicitud;
  readonly fechaHora = fechaHora;
  readonly nombreServicio = nombreServicio;
  readonly iconoServicio = iconoServicio;
  readonly pesos = pesos;

  readonly solicitudes = signal<Solicitud[] | null>(null);
  readonly recientes = signal<Pedido[]>([]);
  readonly errorCarga = signal('');

  // Solicitud nueva
  readonly tipo = signal<TipoSolicitud | null>(null);
  readonly servicioId = signal<number | null>(null);
  readonly asunto = signal('');
  readonly descripcion = signal('');
  readonly enviando = signal(false);
  readonly error = signal('');
  readonly respondiendo = signal<number | null>(null);

  readonly tipoElegido = computed(() => this.tipos.find((t) => t.id === this.tipo()) ?? null);
  readonly abiertas = computed(() => (this.solicitudes() ?? []).filter((s) => s.estado !== 'cerrado').length);

  ionViewDidEnter(): void {
    this.cargar();
    // Desde el detalle de un pedido: ?servicio=42 deja ese servicio elegido
    const s = Number(this.ruta.snapshot.queryParamMap.get('servicio'));
    if (s) this.servicioId.set(s);
  }

  volver(): void {
    this.nav.back();
  }

  elegirTipo(t: TipoSolicitud): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.tipo.set(t);
    this.error.set('');
    if (!this.asunto().trim() || TIPOS_SOLICITUD.some((x) => x.nombre === this.asunto())) this.asunto.set(nombreTipo(t));
    if (!this.tipoElegido()?.conViaje && !this.ruta.snapshot.queryParamMap.get('servicio')) this.servicioId.set(null);
  }

  cancelar(): void {
    this.tipo.set(null);
    this.asunto.set('');
    this.descripcion.set('');
    this.error.set('');
  }

  async enviar(): Promise<void> {
    const tipo = this.tipo();
    const asunto = this.asunto().trim();
    const descripcion = this.descripcion().trim();
    if (!tipo || this.enviando()) return;
    if (!asunto) return this.error.set('Escribe un asunto corto.');
    if (descripcion.length < 10) return this.error.set('Cuéntanos un poco más (al menos 10 letras) para poder ayudarte.');
    this.enviando.set(true);
    this.error.set('');
    try {
      const r = await this.soporte.crear({ tipo, asunto, descripcion, servicioId: this.servicioId() });
      this.cancelar();
      this.nav.navigateForward(this.ruta.snapshot.data['enviado'] ?? '/cliente/reporte/enviado', { queryParams: { id: r.id } });
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos enviar tu solicitud. Revisa tu internet.');
    } finally {
      this.enviando.set(false);
    }
  }

  /** "¿Te sirvió la respuesta?" Sí → cerrada; No → vuelve a revisión. */
  async responder(s: Solicitud, sirvio: boolean): Promise<void> {
    if (this.respondiendo()) return;
    this.respondiendo.set(s.id);
    try {
      await this.soporte.responder(s.id, sirvio);
      this.avisar(sirvio ? '¡Gracias! Cerramos tu solicitud.' : 'Listo, la volvemos a revisar.');
      this.solicitudes.set(await this.soporte.mias());
    } catch (e) {
      this.avisar((e as ErrorApi).message || 'No pudimos guardar tu respuesta.');
    } finally {
      this.respondiendo.set(null);
    }
  }

  /** abierto/en_proceso → "curso"; resuelto → "ok" (falta que diga si le sirvió); cerrado → "cerrado". */
  claseEstado(s: Solicitud): string {
    if (s.estado === 'resuelto') return 'ok';
    if (s.estado === 'cerrado') return 'cerrado';
    return 'curso';
  }

  /** "Te respondemos antes del jue 30 oct" mientras no hay respuesta. */
  limite(s: Solicitud): string {
    if (!s.fecha_limite_respuesta || s.estado === 'resuelto' || s.estado === 'cerrado') return '';
    const f = new Date(s.fecha_limite_respuesta);
    return 'Te respondemos antes del ' + f.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  }

  private async cargar(): Promise<void> {
    const [mias, pedidos] = await Promise.allSettled([this.soporte.mias(), this.historial.mios()]);
    if (mias.status === 'fulfilled') {
      this.solicitudes.set(mias.value);
      this.errorCarga.set('');
    } else {
      this.solicitudes.set([]);
      this.errorCarga.set('No pudimos cargar tus solicitudes. Revisa tu internet.');
    }
    if (pedidos.status === 'fulfilled') this.recientes.set(pedidos.value.slice(0, SERVICIOS_RECIENTES));
  }

  private async avisar(mensaje: string): Promise<void> {
    const t = await this.avisos.create({ message: mensaje, duration: 2500, position: 'top', color: 'dark' });
    await t.present();
  }
}
