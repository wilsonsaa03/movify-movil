import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Único punto de acceso al backend. Usa HttpClient para que el interceptor
 * agregue el JWT y la plataforma a todas las peticiones.
 * Devuelve Promises para mantener el estilo async/await de las páginas.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T = any>(ruta: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.url(ruta)));
  }

  post<T = any>(ruta: string, cuerpo: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(ruta), cuerpo));
  }

  /** Para subir archivos (multipart/form-data). */
  postArchivo<T = any>(ruta: string, campo: string, archivo: Blob, nombre: string): Promise<T> {
    const form = new FormData();
    form.append(campo, archivo, nombre);
    return firstValueFrom(this.http.post<T>(this.url(ruta), form));
  }

  /** Mensaje legible de un error del backend ({ error: "..." }). */
  static mensaje(err: any, porDefecto = 'Ocurrió un error. Intenta de nuevo.'): string {
    if (err?.status === 0) return 'No pudimos conectarnos con MoviFY. Revisa tu conexión.';
    return err?.error?.error || err?.error?.message || porDefecto;
  }

  private url(ruta: string): string {
    return `${this.base}${ruta.startsWith('/') ? '' : '/'}${ruta}`;
  }
}
