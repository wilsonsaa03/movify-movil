import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, NavController, ViewDidEnter } from '@ionic/angular';
import { ErrorApi } from '../../../../core/api.service';
import { pesos } from '../../../../core/formato';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { CambioEstado, HistorialService, Pedido, claseEstado, fechaHora, iconoServicio, nombreServicio } from '../../../../servicios/historial.service';
/** Quién hizo cada cambio, en palabras del cliente. */
const QUIEN: Record<string, string> = {
  cliente: 'Tú',
  conductor: 'Conductor',
  admin: 'MoviFY',
  soporte: 'Soporte MoviFY',
  sistema: 'MoviFY',
};

/**
 * Detalle de un pedido del historial (?id=servicio): qué fue, de dónde a dónde, quién lo llevó, cuánto costó y la
 * línea de tiempo con cada cambio de estado, su fecha y hora y quién lo hizo (tabla historial_estados, HU 2.9).
 */
@Component({
  selector: 'app-pedido-detalle',
  templateUrl: 'pedido-detalle.page.html',
  styleUrls: ['pedido-detalle.page.scss'],
  imports: [IonContent, IconoComponent],
})
export class PedidoDetallePage implements ViewDidEnter {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly historial = inject(HistorialService);

  readonly p = signal<Pedido | null>(null);
  readonly cambios = signal<CambioEstado[]>([]);
  readonly error = signal('');
  readonly pesos = pesos;
  readonly fechaHora = fechaHora;
  private id = 0;

  readonly titulo = computed(() => (this.p() ? nombreServicio(this.p()!) : 'Pedido'));
  readonly icono = computed(() => (this.p() ? iconoServicio(this.p()!) : 'lista'));
  readonly clase = computed(() => claseEstado(this.p()?.estado_codigo ?? ''));
  /** El último cambio de la línea va resaltado (es el estado final). */
  readonly ultimo = computed(() => this.cambios().length - 1);

  ionViewDidEnter(): void {
    this.id = Number(this.ruta.snapshot.queryParamMap.get('id'));
    if (!this.id) {
      this.volver();
      return;
    }
    this.cargar();
  }

  volver(): void {
    this.nav.navigateBack('/cliente/pedidos');
  }

  quien(c: CambioEstado): string {
    return c.actor_rol ? (QUIEN[c.actor_rol] ?? c.actor_rol) : 'MoviFY';
  }

  reportar(): void {
    this.nav.navigateForward('/cliente/reportes', { queryParams: { servicio: this.id } });
  }

  private async cargar(): Promise<void> {
    try {
      const [p, cambios] = await Promise.all([this.historial.detalle(this.id), this.historial.cambios(this.id)]);
      this.p.set(p);
      this.cambios.set(cambios);
      this.error.set('');
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos cargar este pedido.');
    }
  }
}
