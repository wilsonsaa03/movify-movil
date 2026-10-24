import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { pesos } from '../../../../core/formato';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { PasoHistorial, hora } from '../../../../servicios/encomienda.service';
import { DetalleDomicilio, DomicilioService, iconoPedido, tituloPedido } from '../../../../servicios/domicilio.service';

/**
 * Domicilio 5 · ¡Pedido entregado! (?id=servicio)
 * Lo que costó el pedido según la factura, el domicilio y el total pagado en efectivo; calificación al domiciliario.
 */
@Component({
  selector: 'app-domicilio-entregado',
  templateUrl: 'domicilio-entregado.page.html',
  styleUrls: ['domicilio-entregado.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent],
})
export class DomicilioEntregadoPage implements ViewDidEnter {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly domicilios = inject(DomicilioService);

  readonly servicio = signal<DetalleDomicilio | null>(null);
  private readonly historial = signal<PasoHistorial[]>([]);
  readonly estrellas = signal(0);
  readonly calificando = signal(false);
  readonly calificado = signal(false);
  readonly error = signal('');
  readonly pesos = pesos;
  private id = 0;

  readonly icono = computed(() => iconoPedido(this.servicio()?.categoria));
  readonly lugar = computed(() => this.servicio()?.establecimiento ?? tituloPedido(this.servicio()?.categoria));
  readonly cuando = computed(() => hora(this.historial().find((x) => x.estado_nuevo === 'finalizado')?.creado_en));
  /** Con compra: lo que dijo la factura (o el aproximado si no quedó registrado). */
  readonly valorPedido = computed(() => {
    const s = this.servicio();
    if (!s?.requiere_compra) return null;
    return Number(s.valor_compra_real ?? s.valor_productos_aprox ?? 0);
  });
  readonly total = computed(() => Number(this.servicio()?.tarifa ?? 0) + (this.valorPedido() ?? 0));
  readonly conductor = computed(() => (this.servicio()?.conductor_nombre ?? 'tu domiciliario').split(/\s+/)[0]);
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
    this.domicilios.detalle(this.id).then((s) => this.servicio.set(s)).catch(() => this.error.set('No pudimos cargar el pedido.'));
    this.domicilios.historial(this.id).then((h) => this.historial.set(h)).catch(() => undefined);
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
      await this.domicilios.calificar(this.id, this.estrellas());
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
}
