import { Injectable, inject } from '@angular/core';
import { ApiService } from '../core/api.service';
import { SesionService } from '../core/sesion.service';

/** GET /api/usuarios/perfil */
export interface Perfil {
  id: number;
  nombre: string;
  nombres: string;
  apellidos: string | null;
  correo: string | null;
  telefono: string | null;
  telefono_verificado: boolean;
  foto: string | null;
  calificacion: number | null;
  fecha_registro: string;
  viajes_finalizados: number;
  total_gastado: number;
}

/** GET /api/usuarios/direcciones */
export interface LugarGuardado {
  id: number;
  etiqueta: string;
  direccion: string;
  barrio: string | null;
  referencia: string | null;
  lat: number;
  lng: number;
}

/** GET /api/usuarios/contactos-emergencia */
export interface ContactoEmergencia {
  id: number;
  nombre: string;
  telefono: string;
  parentesco: string | null;
}

/**
 * Mi perfil (cliente): datos, foto, clave, lugares guardados, contactos de emergencia y eliminar cuenta.
 * Lo que cambia en el perfil se copia a la sesión para que el inicio muestre el nombre y la foto nuevos.
 */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);

  perfil(): Promise<Perfil> {
    return this.api.get<Perfil>('/usuarios/perfil');
  }

  async actualizar(datos: { nombres: string; apellidos: string; correo: string }): Promise<Perfil> {
    const p = await this.api.put<Perfil>('/usuarios/perfil', datos);
    this.copiarASesion({ nombre: p.nombre, nombres: p.nombres, apellidos: p.apellidos, correo: p.correo });
    return p;
  }

  async subirFoto(archivo: Blob): Promise<string> {
    const form = new FormData();
    form.append('foto', archivo, 'perfil.jpg');
    const r = await this.api.post<{ foto: string }>('/usuarios/perfil/foto', form);
    this.copiarASesion({ foto: r.foto });
    return r.foto;
  }

  /** En la app la "contraseña" es la clave de 4 números. */
  cambiarClave(actual: string, nueva: string): Promise<unknown> {
    return this.api.put('/usuarios/password', { actual, nueva });
  }

  lugares(): Promise<LugarGuardado[]> {
    return this.api.get<LugarGuardado[]>('/usuarios/direcciones');
  }

  guardarLugar(l: Omit<LugarGuardado, 'id'>): Promise<{ id: number }> {
    return this.api.post<{ id: number }>('/usuarios/direcciones', l);
  }

  borrarLugar(id: number): Promise<unknown> {
    return this.api.borrar(`/usuarios/direcciones/${id}`);
  }

  contactos(): Promise<ContactoEmergencia[]> {
    return this.api.get<ContactoEmergencia[]>('/usuarios/contactos-emergencia');
  }

  agregarContacto(c: Omit<ContactoEmergencia, 'id'>): Promise<{ id: number }> {
    return this.api.post<{ id: number }>('/usuarios/contactos-emergencia', c);
  }

  borrarContacto(id: number): Promise<unknown> {
    return this.api.borrar(`/usuarios/contactos-emergencia/${id}`);
  }

  /** Borra la cuenta (los datos personales se anonimizan en el backend) y cierra la sesión. */
  async eliminarCuenta(): Promise<void> {
    await this.api.borrar('/usuarios/cuenta');
    this.sesion.cerrar();
  }

  private copiarASesion(cambios: Partial<{ nombre: string; nombres: string; apellidos: string | null; correo: string | null; foto: string }>): void {
    const d = this.sesion.datos();
    if (d) this.sesion.guardar({ ...d, ...cambios });
  }
}

/** Clave de 4 números que no sea obvia (igual que el registro: 1234, 0000, 1111…). */
export function claveDebil(clave: string): boolean {
  if (!/^\d{4}$/.test(clave)) return true;
  if (/^(\d)\1{3}$/.test(clave)) return true;
  const sube = '0123456789';
  const baja = '9876543210';
  return sube.includes(clave) || baja.includes(clave);
}
