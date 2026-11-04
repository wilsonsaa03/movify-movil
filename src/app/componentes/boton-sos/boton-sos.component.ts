import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../core/api.service';
import { IconoComponent } from '../icono/icono.component';
import { UbicacionService } from '../../servicios/ubicacion.service';
import { ViajeActivoService } from '../../servicios/viaje-activo.service';

/**
 * Botón SOS rojo sobre el mapa del viaje (Figma: "SOS" / "SOS 123").
 * Pide confirmación (para no dispararlo por error), avisa a soporte con la ubicación (POST /api/sos)
 * y ofrece llamar a la Policía (123). Si se envió sin querer, "Fue sin querer" lo cancela
 * (POST /api/sos/{id}/falsa-alarma) para que soporte no lo atienda como emergencia.
 */
@Component({
  selector: 'app-boton-sos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <button type="button" class="sos" [disabled]="enviando()" aria-label="SOS: pedir ayuda de emergencia" (click)="pedirAyuda()">
      <span class="circulo"><app-icono nombre="alerta" /></span>
      <span class="texto">{{ alertaAbierta() ? 'SOS enviado' : conLinea() ? 'SOS 123' : 'SOS' }}</span>
    </button>
  `,
  styles: `
    :host { display: block; }
    .sos {
      border: 0; background: none; padding: 0; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      font-family: 'Nunito', system-ui, sans-serif;
    }
    .circulo {
      width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center;
      background: #e5484d; color: #ffffff; border: 3px solid #ffffff;
      box-shadow: 0 8px 18px rgba(180, 35, 51, 0.4);
    }
    app-icono { width: 24px; height: 24px; --grosor: 2.6; }
    .texto {
      padding: 1px 6px; border-radius: 8px; background: #ffffff;
      font-size: 10.5px; font-weight: 800; color: #b42333;
    }
    .sos:active .circulo { transform: scale(0.94); }
    .sos:focus-visible { outline: 3px solid #ffffff; outline-offset: 2px; border-radius: 12px; }
    .sos:disabled { opacity: 0.7; }
  `,
})
export class BotonSosComponent {
  private readonly alertas = inject(AlertController);
  private readonly avisos = inject(ToastController);
  private readonly gps = inject(UbicacionService);
  private readonly viajes = inject(ViajeActivoService);

  readonly servicioId = input.required<number>();
  /** Muestra "SOS 123" (pantalla del pasajero en viaje). */
  readonly conLinea = input(false);
  readonly enviando = signal(false);
  /** Alerta SOS enviada desde aquí y que sigue abierta (la puede cancelar si fue sin querer). */
  readonly alertaAbierta = signal<number | null>(null);

  async pedirAyuda(): Promise<void> {
    if (this.alertaAbierta()) {
      await this.alertaEnviada();
      return;
    }
    const alerta = await this.alertas.create({
      header: '¿Necesitas ayuda?',
      message: 'Avisaremos al equipo de MoviFY con tu ubicación. Si estás en peligro, llama a la Policía.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Llamar al 123', role: 'llamar' },
        { text: 'Enviar alerta', role: 'alerta' },
      ],
    });
    await alerta.present();
    const { role } = await alerta.onDidDismiss();
    if (role === 'llamar') {
      window.location.href = 'tel:123';
      return;
    }
    if (role !== 'alerta') return;

    this.enviando.set(true);
    Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
    const u = this.gps.ubicacion();
    try {
      const r = await this.viajes.sos(this.servicioId(), u?.lat ?? null, u?.lng ?? null);
      this.alertaAbierta.set(r.id ?? null);
      const t = await this.avisos.create({
        message: r.message,
        duration: 15000,
        position: 'top',
        color: 'success',
        buttons: r.id ? [{ text: 'Fue sin querer', role: 'falsa' }] : [],
      });
      await t.present();
      const { role } = await t.onDidDismiss();
      if (role === 'falsa') await this.cancelarAlerta();
    } catch (e) {
      await this.avisar((e as ErrorApi).message || 'No pudimos enviar la alerta. Llama al 123.', 'danger');
    } finally {
      this.enviando.set(false);
    }
  }

  /** Volvió a tocar SOS con una alerta abierta: sigue activa, llamar al 123 o cancelarla. */
  private async alertaEnviada(): Promise<void> {
    const a = await this.alertas.create({
      header: 'Tu alerta SOS está activa',
      message: 'El equipo de MoviFY ya la está viendo. Si la enviaste sin querer, cancélala para que no la atiendan como emergencia.',
      buttons: [
        { text: 'Sigue activa', role: 'cancel' },
        { text: 'Llamar al 123', role: 'llamar' },
        { text: 'Fue sin querer', role: 'falsa' },
      ],
    });
    await a.present();
    const { role } = await a.onDidDismiss();
    if (role === 'llamar') window.location.href = 'tel:123';
    if (role === 'falsa') await this.cancelarAlerta();
  }

  private async cancelarAlerta(): Promise<void> {
    const id = this.alertaAbierta();
    if (!id) return;
    try {
      await this.viajes.falsaAlarma(id);
      this.alertaAbierta.set(null);
      await this.avisar('Listo: avisamos a soporte que fue sin querer.', 'medium');
    } catch (e) {
      // 404: soporte ya la tomó o la cerró → ya no se puede cancelar desde aquí
      this.alertaAbierta.set(null);
      await this.avisar((e as ErrorApi).message || 'Soporte ya está atendiendo tu alerta.', 'warning');
    }
  }

  private async avisar(mensaje: string, color: string): Promise<void> {
    const t = await this.avisos.create({ message: mensaje, duration: 5000, position: 'top', color });
    await t.present();
  }
}
