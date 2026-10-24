import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../../core/api.service';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { TecladoNumericoComponent } from '../../../componentes/teclado-numerico/teclado-numerico.component';
import { ViajeActivo, ViajeActivoService, primerNombre } from '../../../servicios/viaje-activo.service';

/**
 * Conductor app 4 · Pídele el PIN a Ana (?id=servicio).
 * Viaje: el pasajero le dice su PIN y con él empieza el viaje (en_curso) → En viaje.
 * Encomienda (?para=entrega): quien recibe le da el código de entrega y con él se finaliza → Calificar.
 * Si el PIN no coincide, el backend lo rechaza y se borra para escribirlo de nuevo.
 */
@Component({
  selector: 'app-conductor-pin',
  templateUrl: 'conductor-pin.page.html',
  styleUrls: ['conductor-pin.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, TecladoNumericoComponent],
})
export class ConductorPinPage implements ViewDidEnter {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly viajes = inject(ViajeActivoService);

  readonly v = signal<ViajeActivo | null>(null);
  readonly pin = signal('');
  readonly enviando = signal(false);
  readonly error = signal('');
  readonly entrega = signal(false);
  private id = 0;

  readonly casillas = computed(() => [0, 1, 2, 3].map((i) => this.pin().charAt(i)));
  readonly completo = computed(() => this.pin().length === 4);
  readonly titulo = computed(() => {
    if (this.entrega()) return 'Pide el código de entrega';
    return `Pídele el PIN a ${primerNombre(this.v()?.usuario_nombre, 'tu pasajero')}`;
  });
  readonly ayuda = computed(() =>
    this.entrega()
      ? 'Quien recibe el paquete tiene un código de 4 dígitos. Con él confirmas que lo entregaste a la persona correcta.'
      : 'Así confirmas que llevas a la persona correcta.',
  );

  ionViewDidEnter(): void {
    this.id = Number(this.ruta.snapshot.queryParamMap.get('id'));
    this.entrega.set(this.ruta.snapshot.queryParamMap.get('para') === 'entrega');
    this.pin.set('');
    this.error.set('');
    if (!this.id) {
      this.nav.navigateRoot('/conductor/inicio');
      return;
    }
    this.viajes.empezarReporte();
    this.viajes.detalle(this.id).then((v) => this.v.set(v)).catch(() => undefined);
  }

  volver(): void {
    this.nav.navigateRoot(this.entrega() ? '/conductor/viaje/en-curso' : '/conductor/viaje/recogida', {
      queryParams: { id: this.id },
      animationDirection: 'back',
    });
  }

  digito(d: string): void {
    if (this.enviando() || this.completo()) return;
    this.error.set('');
    this.pin.update((p) => p + d);
  }

  borrar(): void {
    if (this.enviando()) return;
    this.error.set('');
    this.pin.update((p) => p.slice(0, -1));
  }

  async confirmar(): Promise<void> {
    if (!this.completo() || this.enviando()) return;
    this.enviando.set(true);
    try {
      if (this.entrega()) {
        await this.viajes.avanzar(this.id, { estado: 'finalizado', codigo_entrega: this.pin() });
        Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
        this.viajes.pararReporte();
        this.nav.navigateRoot('/conductor/viaje/calificar', { queryParams: { id: this.id } });
      } else {
        await this.viajes.avanzar(this.id, { estado: 'en_curso', codigo_abordaje: this.pin() });
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
        this.nav.navigateRoot('/conductor/viaje/en-curso', { queryParams: { id: this.id } });
      }
    } catch (e) {
      Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
      this.error.set((e as ErrorApi).message || 'No pudimos confirmar el PIN. Intenta de nuevo.');
      this.pin.set('');
    } finally {
      this.enviando.set(false);
    }
  }
}
