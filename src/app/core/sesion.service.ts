import { Injectable, computed, signal } from '@angular/core';

/** Lo que responde el backend al entrar o registrarse. */
export interface RespuestaSesion {
  token: string;
  refreshToken: string;
  id: number;
  rol: 'cliente' | 'conductor' | 'soporte' | 'admin';
  roles: string[];
  nombre: string;
  nombres: string;
  apellidos: string | null;
  correo: string | null;
  telefono: string | null;
  foto: string | null;
  conductor: { estado: string; motivo: string | null } | null;
  siguientePaso?: string;
}

const CLAVE = 'movify.sesion';

/**
 * Sesión guardada en el celular (localStorage del WebView). La clave NUNCA se guarda:
 * solo el token (JWT) y el refresh token que entrega el backend.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  readonly datos = signal<RespuestaSesion | null>(this.leer());
  readonly activa = computed(() => !!this.datos()?.token);

  get token(): string | null {
    return this.datos()?.token ?? null;
  }

  guardar(s: RespuestaSesion): void {
    this.datos.set(s);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(s));
    } catch {
      /* sin almacenamiento: la sesión dura mientras la app esté abierta */
    }
  }

  cerrar(): void {
    this.datos.set(null);
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      /* nada */
    }
  }

  private leer(): RespuestaSesion | null {
    try {
      const t = localStorage.getItem(CLAVE);
      return t ? (JSON.parse(t) as RespuestaSesion) : null;
    } catch {
      return null;
    }
  }
}
