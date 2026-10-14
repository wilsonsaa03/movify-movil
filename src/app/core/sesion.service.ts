import { Injectable } from '@angular/core';

/** Lo que responde el backend al entrar o registrarse (/auth/registro-movil, /auth/login-celular). */
export interface RespuestaSesion {
  token: string;
  refreshToken: string;
  expiraEnSeg: number;
  id: number;
  rol: string;
  nombre: string;
  telefono: string;
  foto: string | null;
  siguientePaso?: string;
}

/**
 * Sesión guardada en el celular (localStorage del WebView de Capacitor).
 * El backend es quien decide; esto solo guía la navegación.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private ls(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  get token(): string {
    return this.ls()?.getItem('token') || '';
  }

  get refreshToken(): string {
    return this.ls()?.getItem('refreshToken') || '';
  }

  get rol(): string {
    return this.ls()?.getItem('rol') || '';
  }

  /** Hay token y no venció (se lee el exp del JWT sin validarlo: eso lo hace el backend). */
  get activa(): boolean {
    const t = this.token;
    if (!t || t.split('.').length !== 3) return false;
    try {
      const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp !== 'number' || payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  guardar(res: RespuestaSesion): void {
    const ls = this.ls();
    if (!ls) return;
    ls.setItem('token', res.token || '');
    ls.setItem('refreshToken', res.refreshToken || '');
    ls.setItem('id', res.id != null ? String(res.id) : '');
    ls.setItem('rol', res.rol || '');
    ls.setItem('nombre', res.nombre || '');
    ls.setItem('telefono', res.telefono || '');
    ls.setItem('foto', res.foto || '');
  }

  actualizarFoto(url: string): void {
    this.ls()?.setItem('foto', url);
  }

  cerrar(): void {
    this.ls()?.clear();
  }
}
