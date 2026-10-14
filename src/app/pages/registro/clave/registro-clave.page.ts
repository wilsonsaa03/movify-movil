import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { TecladoNumericoComponent } from '../../../componentes/teclado-numerico/teclado-numerico.component';
import { PuntosClaveComponent } from '../../../componentes/puntos-clave/puntos-clave.component';
import { RegistroService, claveDebil } from '../../../servicios/registro.service';
import { ErrorApi } from '../../../core/api.service';

const LARGO = 4;

/**
 * Registro · Paso 4 de 4: crear la clave de 4 dígitos.
 * Se escribe dos veces (crear y confirmar) para evitar errores de dedo.
 */
@Component({
  selector: 'app-registro-clave',
  templateUrl: 'registro-clave.page.html',
  styleUrls: ['registro-clave.page.scss'],
  imports: [IonContent, HeroCieloComponent, TecladoNumericoComponent, PuntosClaveComponent],
})
export class RegistroClavePage {
  private readonly router = inject(Router);
  private readonly registro = inject(RegistroService);

  readonly fase = signal<'crear' | 'confirmar'>('crear');
  readonly clave = signal('');
  private primera = '';

  readonly error = signal('');
  readonly sacudir = signal(false);
  readonly creando = signal(false);

  readonly completa = computed(() => this.clave().length === LARGO);
  readonly titulo = computed(() => (this.fase() === 'crear' ? 'Crea tu clave' : 'Confirma tu clave'));
  readonly subtitulo = computed(() =>
    this.fase() === 'crear' ? '4 números que solo tú sepas.' : 'Escríbela otra vez para estar seguros.',
  );

  agregar(d: string): void {
    if (this.creando() || this.completa()) return;
    this.error.set('');
    this.clave.update((c) => c + d);
    if (this.completa()) setTimeout(() => this.siguiente(), 150); // deja ver el 4.º punto lleno
  }

  quitar(): void {
    if (this.creando()) return;
    this.error.set('');
    this.clave.update((c) => c.slice(0, -1));
  }

  async siguiente(): Promise<void> {
    if (!this.completa() || this.creando()) return;
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
      this.fase.set('crear');
      this.primera = '';
      return;
    }

    this.creando.set(true);
    try {
      await this.registro.crearCuenta(clave);
      this.primera = '';
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      this.router.navigateByUrl('/registro/listo', { replaceUrl: true });
    } catch (e) {
      // Si el backend la rechaza (p. ej. clave débil o el código venció) se vuelve a crear
      this.fallar((e as ErrorApi).message);
      this.fase.set('crear');
      this.primera = '';
    } finally {
      this.creando.set(false);
    }
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
