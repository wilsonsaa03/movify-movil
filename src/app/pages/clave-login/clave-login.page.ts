import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { HeroCieloComponent } from '../../componentes/hero-cielo/hero-cielo.component';
import { TecladoNumericoComponent } from '../../componentes/teclado-numerico/teclado-numerico.component';
import { PuntosClaveComponent } from '../../componentes/puntos-clave/puntos-clave.component';
import { formatearCelular } from '../../servicios/registro.service';
import { ApiService, ErrorApi } from '../../core/api.service';
import { RespuestaSesion, SesionService } from '../../core/sesion.service';

const LARGO = 4;

/**
 * Iniciar sesión · Paso 2 de 2: la clave de 4 dígitos.
 *
 * POST /api/auth/login-celular { celular, clave } → sesión (JWT + refresh).
 * El backend cuenta los intentos fallidos y bloquea un rato (429); la app solo muestra su mensaje.
 * Si la clave está mal (401) no se guarda nada: solo se muestra el error y se limpia la clave.
 * Al entrar, cada rol va a su inicio (SesionService.rutaInicio).
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
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);

  readonly celular = this.ruta.snapshot.queryParamMap.get('celular') ?? '';
  private readonly servicio = this.ruta.snapshot.queryParamMap.get('servicio');
  readonly celularVisible = formatearCelular(this.celular);

  readonly clave = signal('');
  readonly entrando = signal(false);
  readonly error = signal('');
  readonly sacudir = signal(false);
  /** El backend respondió 429: demasiados intentos. */
  readonly bloqueado = signal(false);

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
    if (this.entrando()) return;
    this.entrando.set(true);
    try {
      const r = await this.api.post<RespuestaSesion>('/auth/login-celular', {
        celular: this.celular,
        clave: this.clave(),
      });
      this.sesion.guardar(r);
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      this.nav.navigateRoot(this.sesion.rutaInicio(), { queryParams: this.servicio ? { servicio: this.servicio } : {} });
    } catch (e) {
      const err = e as ErrorApi;
      Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
      this.bloqueado.set(err.status === 429);
      this.error.set(err.message);
      this.sacudir.set(true);
      setTimeout(() => {
        this.sacudir.set(false);
        this.clave.set('');
      }, 420);
    } finally {
      this.entrando.set(false);
    }
  }

  olvide(): void {
    this.nav.navigateForward('/login/recuperar', { queryParams: { celular: this.celular } });
  }

  cambiarNumero(): void {
    this.nav.navigateBack('/login');
  }
}
