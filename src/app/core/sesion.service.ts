import { Injectable, signal } from '@angular/core';

export type Rol = 'cliente' | 'conductor' | 'soporte' | 'admin';

/** Lo que responde el backend al entrar o registrarse. */
export interface RespuestaSesion {
  token: string;
  refreshToken: string;
  id: number;
  rol: Rol;
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

/** Si al token le quedan menos de estos segundos, se toma como vencido y se renueva antes de usarlo. */
const MARGEN_SEG = 30;

/**
 * Sesión guardada en el celular (localStorage del WebView). La clave NUNCA se guarda:
 * solo el token de acceso (JWT) y el refresh token que entrega el backend.
 *
 * Lo que se lee aquí (rol, vencimiento) solo sirve para decidir a qué pantalla ir.
 * Quien de verdad valida la firma del JWT y los permisos es el backend.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  readonly datos = signal<RespuestaSesion | null>(this.leer());

  get token(): string | null {
    return this.datos()?.token ?? null;
  }

  get refreshToken(): string | null {
    return this.datos()?.refreshToken ?? null;
  }

  /**
   * ¿Hay sesión con la que se pueda trabajar?
   * Sí, si el token sigue vigente o si, aunque venció, hay refresh token para pedir otro.
   * (Es un método y no un computed porque depende de la hora actual.)
   */
  activa(): boolean {
    const d = this.datos();
    if (!d?.token) return false;
    return !this.tokenVencido() || !!d.refreshToken;
  }

  /** true si hay token de acceso y ya venció (o le quedan menos de 30 s). */
  tokenVencido(): boolean {
    const t = this.token;
    if (!t) return false;
    const exp = SesionService.vencimiento(t);
    return exp === null || exp * 1000 - MARGEN_SEG * 1000 <= Date.now();
  }

  /** ¿Tiene alguno de estos roles? Mira el rol principal y la lista de roles. */
  tieneRol(...roles: Rol[]): boolean {
    const d = this.datos();
    if (!d) return false;
    const mios = new Set([d.rol, ...(d.roles ?? [])].map((r) => String(r).toLowerCase()));
    return roles.some((r) => mios.has(r));
  }

  /**
   * Pantalla de inicio según el rol.
   *  - conductor aprobado → su panel; si aún no lo aprueban → /conductor (sigue el registro donde quedó)
   *  - cliente → /cliente
   *  - admin y soporte trabajan en la web; en el celular entran como cliente
   */
  rutaInicio(): string {
    const d = this.datos();
    if (!d || !this.activa()) return '/login';
    if (d.rol === 'conductor') return d.conductor?.estado === 'aprobado' ? '/conductor/inicio' : '/conductor';
    return '/cliente';
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

  /** Lee el "exp" (segundos) del JWT sin validarlo. null si el token no tiene forma de JWT. */
  static vencimiento(token: string): number | null {
    const partes = token.split('.');
    if (partes.length !== 3) return null;
    try {
      let b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
      b64 += '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(b64)) as { exp?: unknown };
      return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
      return null;
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
