import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { HeroCieloComponent } from '../../componentes/hero-cielo/hero-cielo.component';
import { TecladoNumericoComponent } from '../../componentes/teclado-numerico/teclado-numerico.component';
import { PuntosClaveComponent } from '../../componentes/puntos-clave/puntos-clave.component';
import { formatearCelular } from '../../servicios/registro.service';

const LARGO = 4;
const MAX_INTENTOS = 5;

/**
 * Iniciar sesión · Paso 2 de 2: la clave de 4 dígitos.
 *
 * ⚠️ MODO DEMO (sin backend): acepta cualquier clave menos 0000 (para poder probar el error).
 * TODO backend: POST /api/auth/login { celular, clave } → token JWT.
 * El límite de intentos de verdad lo debe controlar el backend, no la app.
 */
@Component({
  selector: 'app-clave-login',
  templateUrl: 'clave-login.page.html',
  styleUrls: ['clave-login.page.scss'],
  imports: [IonContent, HeroCieloComponent, TecladoNumericoComponent, PuntosClaveComponent],
})
export class ClaveLoginPage {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);

  readonly celular = this.ruta.snapshot.queryParamMap.get('celular') ?? '';
  private readonly servicio = this.ruta.snapshot.queryParamMap.get('servicio');
  readonly celularVisible = formatearCelular(this.celular);

  readonly clave = signal('');
  readonly entrando = signal(false);
  readonly error = signal('');
  readonly sacudir = signal(false);
  readonly intentos = signal(0);
  readonly bloqueado = computed(() => this.intentos() >= MAX_INTENTOS);

  agregar(d: string): void {
    if (this.entrando() || this.bloqueado() || this.clave().length >= LARGO) return;
    this.error.set('');
    this.clave.update((c) => c + d);
    if (this.clave().length === LARGO) setTimeout(() => this.entrar(), 150);
  }

  quitar(): void {
    if (this.entrando()) return;
    this.error.set('');
    this.clave.update((c) => c.slice(0, -1));
  }

  private async entrar(): Promise<void> {
    this.entrando.set(true);
    await new Promise((r) => setTimeout(r, 800)); // DEMO: simula la llamada al backend
    const ok = this.clave() !== '0000';
    this.entrando.set(false);

    if (ok) {
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      this.nav.navigateRoot('/cliente', { queryParams: this.servicio ? { servicio: this.servicio } : {} });
      return;
    }

    Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
    this.intentos.update((n) => n + 1);
    const quedan = MAX_INTENTOS - this.intentos();
    this.error.set(
      quedan > 0
        ? `Clave incorrecta. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.`
        : 'Hiciste demasiados intentos. Recupera tu clave para entrar.',
    );
    this.sacudir.set(true);
    setTimeout(() => {
      this.sacudir.set(false);
      this.clave.set('');
    }, 420);
  }

  olvide(): void {
    this.nav.navigateForward('/login/recuperar', { queryParams: { celular: this.celular } });
  }

  cambiarNumero(): void {
    this.nav.navigateBack('/login');
  }
}
