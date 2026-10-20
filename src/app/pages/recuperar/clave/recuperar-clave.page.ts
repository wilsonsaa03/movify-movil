import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { TecladoNumericoComponent } from '../../../componentes/teclado-numerico/teclado-numerico.component';
import { PuntosClaveComponent } from '../../../componentes/puntos-clave/puntos-clave.component';
import { claveDebil } from '../../../servicios/registro.service';
import { RecuperarService } from '../../../servicios/recuperar.service';
import { ErrorApi } from '../../../core/api.service';

const LARGO = 4;

/**
 * Recuperar clave · Paso 3 de 4 (crear la clave nueva) y Paso 4 de 4 (confirmarla).
 * Al confirmar se guarda con POST /auth/clave/restablecer.
 */
@Component({
  selector: 'app-recuperar-clave',
  templateUrl: 'recuperar-clave.page.html',
  styleUrls: ['recuperar-clave.page.scss'],
  imports: [IonContent, HeroCieloComponent, TecladoNumericoComponent, PuntosClaveComponent],
})
export class RecuperarClavePage {
  private readonly nav = inject(NavController);
  private readonly recuperar = inject(RecuperarService);

  readonly fase = signal<'crear' | 'confirmar'>('crear');
  readonly clave = signal('');
  private primera = '';

  readonly error = signal('');
  readonly sacudir = signal(false);
  readonly guardando = signal(false);

  readonly completa = computed(() => this.clave().length === LARGO);
  readonly paso = computed(() => (this.fase() === 'crear' ? 3 : 4));
  readonly titulo = computed(() => (this.fase() === 'crear' ? 'Crea tu nueva clave' : 'Confirma tu clave'));
  readonly subtitulo = computed(() =>
    this.fase() === 'crear' ? '4 dígitos que solo tú conozcas.' : 'Escríbela otra vez para estar seguros.',
  );

  agregar(d: string): void {
    if (this.guardando() || this.completa()) return;
    this.error.set('');
    this.clave.update((c) => c + d);
    if (this.completa()) setTimeout(() => this.siguiente(), 150); // deja ver el 4.º punto lleno
  }

  quitar(): void {
    if (this.guardando()) return;
    this.error.set('');
    this.clave.update((c) => c.slice(0, -1));
  }

  async siguiente(): Promise<void> {
    if (!this.completa() || this.guardando()) return;
    const clave = this.clave();

    if (this.fase() === 'crear') {
      if (claveDebil(clave)) {
        this.fallar('Esa clave es muy fácil de adivinar. Prueba con otra.');
        return;
      }
      this.primera = clave;
      this.clave.set('');
      this.fase.set('confirmar');
      return;
    }

    if (clave !== this.primera) {
      this.fallar('Las claves no coinciden. Créala de nuevo.');
      this.reiniciar();
      return;
    }

    this.guardando.set(true);
    try {
      await this.recuperar.cambiarClave(clave);
      this.primera = '';
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      this.nav.navigateRoot('/login/recuperar/listo');
    } catch (e) {
      // El código pudo vencer o el backend rechazó la clave: se vuelve a crear
      this.fallar((e as ErrorApi).message);
      this.reiniciar();
    } finally {
      this.guardando.set(false);
    }
  }

  private reiniciar(): void {
    this.primera = '';
    this.fase.set('crear');
  }

  private fallar(mensaje: string): void {
    Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
    this.error.set(mensaje);
    this.sacudir.set(true);
    setTimeout(() => {
      this.sacudir.set(false);
      this.clave.set('');
    }, 420);
  }
}
