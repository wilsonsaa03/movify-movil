import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { pesos } from '../../../../core/formato';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { DatosPaquete, DetalleEnvio, EncomiendaService, PasoHistorial, hora, nombrePaquete } from '../../../../servicios/encomienda.service';

/**
 * Encomienda 5 · ¡Paquete entregado! (?id=servicio)
 * Resumen (recogido / entregado con código), lo que se pagó en efectivo y la calificación al conductor.
 */
@Component({
  selector: 'app-encomienda-entregada',
  templateUrl: 'encomienda-entregada.page.html',
  styleUrls: ['encomienda-entregada.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent],
})
export class EncomiendaEntregadaPage implements ViewDidEnter {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly envio = inject(EncomiendaService);

  readonly servicio = signal<DetalleEnvio | null>(null);
  readonly paquete = signal<DatosPaquete | null>(null);
  private readonly historial = signal<PasoHistorial[]>([]);
  readonly estrellas = signal(0);
  readonly calificando = signal(false);
  readonly calificado = signal(false);
  readonly error = signal('');
  readonly pesos = pesos;
  private id = 0;

  readonly titulo = computed(() => {
    const p = this.paquete();
    return p ? nombrePaquete(p.tamano, p.fragil) : '';
  });
  readonly recogido = computed(() => this.cuando('en_curso'));
  readonly entregado = computed(() => this.cuando('finalizado'));
  readonly quienRecibio = computed(() => this.paquete()?.entregado_a ?? this.paquete()?.destinatario_nombre ?? '');
  readonly conductor = computed(() => (this.servicio()?.conductor_nombre ?? 'el conductor').split(/\s+/)[0]);
  readonly iniciales = computed(() =>
    (this.servicio()?.conductor_nombre ?? '')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join(''),
  );

  ionViewDidEnter(): void {
    this.id = Number(this.ruta.snapshot.queryParamMap.get('id'));
    if (!this.id) {
      this.nav.navigateRoot('/cliente');
      return;
    }
    this.envio.detalle(this.id).then((s) => this.servicio.set(s)).catch(() => this.error.set('No pudimos cargar el envío.'));
    this.envio.paquete(this.id).then((p) => this.paquete.set(p)).catch(() => undefined);
    this.envio.historial(this.id).then((h) => this.historial.set(h)).catch(() => undefined);
  }

  calificar(n: number): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.estrellas.set(n);
  }

  async enviarCalificacion(): Promise<void> {
    if (!this.estrellas() || this.calificando()) return;
    this.calificando.set(true);
    this.error.set('');
    try {
      await this.envio.calificar(this.id, this.estrellas());
      this.calificado.set(true);
      setTimeout(() => this.alInicio(), 900);
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos guardar tu calificación.');
    } finally {
      this.calificando.set(false);
    }
  }

  alInicio(): void {
    this.nav.navigateRoot('/cliente', { animationDirection: 'back' });
  }

  reportar(): void {
    this.nav.navigateForward('/cliente/reportes', { queryParams: { servicio: this.id } });
  }

  private cuando(estado: string): string {
    return hora(this.historial().find((x) => x.estado_nuevo === estado)?.creado_en);
  }
}
