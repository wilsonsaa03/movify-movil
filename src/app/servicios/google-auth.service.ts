import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { ApiService } from '../core/api.service';
import { RespuestaSesion, SesionService } from '../core/sesion.service';

const SCRIPT_GOOGLE = 'https://accounts.google.com/gsi/client';

/** Lo poco que usamos de Google Identity Services (la librería oficial de "Iniciar sesión con Google"). */
interface GoogleId {
  initialize(config: {
    client_id: string;
    callback: (r: { credential: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(el: HTMLElement, opciones: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

/**
 * "Continuar con Google" (OAuth 2.0 / OpenID Connect).
 *
 * Cómo funciona:
 *  1. Google muestra su botón oficial y la persona elige su cuenta.
 *  2. Google nos entrega un id_token (un JWT firmado por Google con nombre, correo y foto).
 *  3. La app se lo manda al backend (POST /api/auth/login-google). El backend verifica la firma con Google,
 *     busca o crea la cuenta y responde con NUESTRO JWT de MoviFY, igual que el login con celular.
 *
 * Por ahora funciona en el navegador (ionic serve). En el APK de Android se necesita un plugin nativo
 * y un cliente OAuth tipo Android en Google Cloud (paquete + huella SHA-1): se hace junto con el build.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly nav = inject(NavController);
  private carga: Promise<GoogleId> | null = null;

  /** false dentro del APK (todavía sin plugin nativo) o si no hay Client ID configurado. */
  disponible(): boolean {
    return !Capacitor.isNativePlatform() && !!environment.googleClientId;
  }

  /**
   * Dibuja el botón oficial de Google dentro de "contenedor".
   * Cada vez que la persona elige una cuenta se llama alElegir con el id_token.
   */
  async mostrarBoton(contenedor: HTMLElement, alElegir: (idToken: string) => void): Promise<void> {
    const id = await this.cargar();
    id.initialize({
      client_id: environment.googleClientId,
      callback: (r) => alElegir(r.credential),
      ux_mode: 'popup',
      cancel_on_tap_outside: true,
    });
    contenedor.innerHTML = '';
    id.renderButton(contenedor, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      locale: 'es',
      width: Math.min(Math.max(contenedor.clientWidth, 200), 400),
    });
  }

  /**
   * Cambia el id_token de Google por la sesión de MoviFY (POST /api/auth/login-google), la guarda y lleva
   * a la pantalla de inicio según el rol. Lanza ErrorApi con el mensaje del backend si no se pudo.
   * `servicio`: lo que había tocado en la pantalla de inicio (moto, taxi…) para llevarlo directo ahí.
   */
  async entrar(idToken: string, servicio: string | null): Promise<void> {
    const r = await this.api.post<RespuestaSesion>('/auth/login-google', { token: idToken });
    this.sesion.guardar(r);
    Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    this.nav.navigateRoot(this.sesion.rutaInicio(), { queryParams: servicio ? { servicio } : {} });
  }

  /** Carga el script de Google una sola vez (solo cuando alguien abre esta pantalla). */
  private cargar(): Promise<GoogleId> {
    const yaEsta = window.google?.accounts?.id;
    if (yaEsta) return Promise.resolve(yaEsta);
    this.carga ??= new Promise<GoogleId>((ok, mal) => {
      const s = document.createElement('script');
      s.src = SCRIPT_GOOGLE;
      s.async = true;
      s.defer = true;
      s.onload = () => {
        const id = window.google?.accounts?.id;
        if (id) ok(id);
        else mal(new Error('Google no respondió'));
      };
      s.onerror = () => mal(new Error('No se pudo cargar Google'));
      document.head.appendChild(s);
    }).catch((e) => {
      this.carga = null; // para poder reintentar
      throw e;
    });
    return this.carga;
  }
}
