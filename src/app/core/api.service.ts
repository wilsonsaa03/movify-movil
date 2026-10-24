import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { NavController } from '@ionic/angular';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { RespuestaSesion, SesionService } from './sesion.service';

/** Error con el mensaje que manda el backend: { "error": "..." }. */
export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const SESION_VENCIDA = 'Tu sesión venció. Inicia sesión de nuevo.';

/**
 * Llamadas al backend de MoviFY. El token y la plataforma los agrega el interceptor.
 * Todas devuelven promesas y, si algo falla, lanzan ErrorApi con un mensaje para mostrar.
 *
 * Manejo del JWT:
 *  1. Si el token de acceso ya venció, pide uno nuevo con el refresh token ANTES de llamar.
 *  2. Si aun así el backend responde 401, renueva una vez y repite la llamada.
 *  3. Si el refresh token tampoco sirve, cierra la sesión y lleva al login con el aviso "Tu sesión venció".
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(SesionService);
  private readonly nav = inject(NavController);
  private readonly base = environment.apiUrl;
  private renovando: Promise<boolean> | null = null;

  get<T>(ruta: string): Promise<T> {
    return this.llamar(() => this.http.get<T>(this.base + ruta));
  }

  post<T>(ruta: string, cuerpo: unknown): Promise<T> {
    return this.llamar(() => this.http.post<T>(this.base + ruta, cuerpo));
  }

  put<T>(ruta: string, cuerpo: unknown): Promise<T> {
    return this.llamar(() => this.http.put<T>(this.base + ruta, cuerpo));
  }

  borrar<T>(ruta: string): Promise<T> {
    return this.llamar(() => this.http.delete<T>(this.base + ruta));
  }

  /** Descarga un archivo protegido (p. ej. un documento propio) para mostrarlo en la app. */
  blob(ruta: string): Promise<Blob> {
    return this.llamar(() => this.http.get(this.base + ruta, { responseType: 'blob' }));
  }

  /**
   * Sube un formulario multipart informando el avance (0 a 1).
   * Se usa para los documentos del conductor, que pueden pesar varios MB.
   */
  subir<T>(ruta: string, form: FormData, avance: (fraccion: number) => void): Promise<T> {
    const enviar = () =>
      new Observable<T>((sub) => {
        const s = this.http.post<T>(this.base + ruta, form, { reportProgress: true, observe: 'events' }).subscribe({
          next: (ev) => {
            if (ev.type === HttpEventType.UploadProgress && ev.total) avance(ev.loaded / ev.total);
            if (ev.type === HttpEventType.Response) {
              avance(1);
              sub.next(ev.body as T);
              sub.complete();
            }
          },
          error: (e) => sub.error(e),
        });
        return () => s.unsubscribe();
      });
    return this.llamar(enviar);
  }

  /**
   * Pide un token nuevo con el refresh token y guarda la sesión. Devuelve false si no se pudo.
   * Sin internet NO cierra la sesión (el refresh token puede seguir sirviendo cuando vuelva la conexión).
   */
  renovarSesion(): Promise<boolean> {
    const refresh = this.sesion.refreshToken;
    if (!refresh) return Promise.resolve(false);
    // Si varias llamadas fallan al tiempo, todas esperan la misma renovación
    this.renovando ??= firstValueFrom(
      this.http.post<RespuestaSesion>(this.base + '/auth/refresh', { refreshToken: refresh }),
    )
      .then((s) => {
        this.sesion.guardar(s);
        return true;
      })
      .catch((e) => {
        if (!(e instanceof HttpErrorResponse && e.status === 0)) this.sesionVencida();
        return false;
      })
      .finally(() => (this.renovando = null));
    return this.renovando;
  }

  /**
   * Cerrar sesión: borra el token del celular y le pide al backend que anule el refresh token
   * (POST /api/auth/logout). Si no hay internet, igual sale; el refresh token vence solo.
   */
  async cerrarSesion(): Promise<void> {
    const refresh = this.sesion.refreshToken;
    this.sesion.cerrar();
    if (refresh) {
      await firstValueFrom(this.http.post(this.base + '/auth/logout', { refreshToken: refresh })).catch(() => undefined);
    }
  }

  private async llamar<T>(crear: () => Observable<T>): Promise<T> {
    // 1. Token vencido: se renueva antes de llamar (así no se gasta una petición en un 401 seguro)
    if (this.sesion.tokenVencido()) {
      const ok = await this.renovarSesion();
      if (!ok && !this.sesion.activa()) throw new ErrorApi(SESION_VENCIDA, 401);
    }
    try {
      return await firstValueFrom(crear());
    } catch (e) {
      // 2. El backend dijo 401 (token revocado, secreto cambiado...): una sola renovación y reintento
      const esAuth = e instanceof HttpErrorResponse && e.status === 401 && !e.url?.includes('/auth/');
      if (esAuth && this.sesion.datos()) {
        if (!(await this.renovarSesion())) {
          this.sesionVencida(); // el backend ya rechazó el token y no hubo cómo renovarlo
          throw new ErrorApi(SESION_VENCIDA, 401);
        }
        try {
          return await firstValueFrom(crear());
        } catch (e2) {
          throw await ApiService.aError(e2);
        }
      }
      throw await ApiService.aError(e);
    }
  }

  /** 3. El refresh token ya no sirve: se borra la sesión y se vuelve al login con el aviso. */
  private sesionVencida(): void {
    if (!this.sesion.datos()) return;
    this.sesion.cerrar();
    this.nav.navigateRoot('/login', { queryParams: { expirada: 1 } });
  }

  static async aError(e: unknown): Promise<ErrorApi> {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) {
        return new ErrorApi('No hay conexión con MoviFY. Revisa tu internet e intenta de nuevo.', 0);
      }
      let cuerpo: unknown = e.error;
      if (cuerpo instanceof Blob) {
        try {
          cuerpo = JSON.parse(await cuerpo.text());
        } catch {
          cuerpo = null;
        }
      }
      const delBackend = cuerpo && typeof cuerpo === 'object' ? (cuerpo as { error?: unknown }).error : null;
      const msg =
        (typeof delBackend === 'string' && delBackend) ||
        (e.status === 413 ? 'El archivo es muy pesado (máximo 10 MB).' : 'Algo salió mal. Intenta de nuevo.');
      return new ErrorApi(msg, e.status);
    }
    return new ErrorApi('Algo salió mal. Intenta de nuevo.', -1);
  }
}
