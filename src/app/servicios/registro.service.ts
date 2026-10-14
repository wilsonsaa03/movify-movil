import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, ErrorApi } from '../core/api.service';
import { RespuestaSesion, SesionService } from '../core/sesion.service';

export type Rol = 'cliente' | 'conductor';

export interface DatosPersonales {
  nombre: string;
  apellido: string;
  correo: string;
  ciudad: string;
  foto: string | null; // dataURL de la foto (opcional)
}

/**
 * Guarda lo que el usuario va llenando en los 4 pasos del registro
 * (celular → código → datos → clave) y habla con el backend:
 *
 *   1. POST /auth/codigo            { celular, proposito: "registro" }   → llega un SMS (Twilio)
 *   2. POST /auth/codigo/verificar  { celular, proposito, codigo }        → verificacionToken
 *   3. POST /auth/registro-movil    { verificacionToken, datos, clave }  → sesión (JWT)
 *   4. POST /usuarios/perfil/foto   (si eligió foto)
 */
@Injectable({ providedIn: 'root' })
export class RegistroService {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);

  readonly rol = signal<Rol | null>(null);
  readonly celular = signal(''); // 10 dígitos, sin +57
  readonly celularVerificado = signal(false);
  readonly datos = signal<DatosPersonales | null>(null);
  readonly cuentaCreada = signal(false);

  /** Solo en desarrollo (SMS_CONSOLA=true en el backend): el código llega en la respuesta. */
  readonly codigoDesarrollo = signal<string | null>(null);
  private verificacionToken: string | null = null;

  /** "3001234567" → "+57 300 123 4567" */
  readonly celularVisible = computed(() => formatearCelular(this.celular()));

  iniciar(rol: Rol): void {
    this.rol.set(rol);
    this.celular.set('');
    this.celularVerificado.set(false);
    this.datos.set(null);
    this.cuentaCreada.set(false);
    this.codigoDesarrollo.set(null);
    this.verificacionToken = null;
  }

  /** Lanza ErrorApi con el mensaje del backend (p. ej. "Ya existe una cuenta con ese celular"). */
  async enviarCodigo(celular: string): Promise<void> {
    const r = await this.api.post<{ vigenciaSeg: number; codigoDesarrollo?: string }>('/auth/codigo', {
      celular,
      proposito: 'registro',
    });
    this.celular.set(celular);
    this.celularVerificado.set(false);
    this.codigoDesarrollo.set(r.codigoDesarrollo ?? null);
  }

  /** Lanza ErrorApi si el código no es correcto (el mensaje dice cuántos intentos quedan). */
  async verificarCodigo(codigo: string): Promise<void> {
    const r = await this.api.post<{ verificacionToken: string }>('/auth/codigo/verificar', {
      celular: this.celular(),
      proposito: 'registro',
      codigo,
    });
    this.verificacionToken = r.verificacionToken;
    this.celularVerificado.set(true);
  }

  guardarDatos(datos: DatosPersonales): void {
    this.datos.set(datos);
  }

  /** Crea la cuenta y deja la sesión iniciada. La clave viaja una sola vez y el backend la guarda con BCrypt. */
  async crearCuenta(clave: string): Promise<RespuestaSesion> {
    const d = this.datos();
    if (!d || !this.verificacionToken) throw new ErrorApi('Vuelve a empezar el registro', 400);
    const r = await this.api.post<RespuestaSesion>('/auth/registro-movil', {
      verificacionToken: this.verificacionToken,
      rol: this.rol() ?? 'cliente',
      nombres: d.nombre,
      apellidos: d.apellido,
      correo: d.correo || null,
      clave,
      aceptaTerminos: true,
    });
    this.sesion.guardar(r);
    if (d.foto) {
      // La foto es opcional: si falla, la cuenta igual queda creada
      try {
        const blob = await (await fetch(d.foto)).blob();
        const form = new FormData();
        form.append('foto', blob, 'perfil.jpg');
        const f = await this.api.post<{ foto: string }>('/usuarios/perfil/foto', form);
        this.sesion.guardar({ ...r, foto: f.foto });
      } catch {
        /* se puede subir después desde el perfil */
      }
    }
    this.cuentaCreada.set(true);
    return r;
  }
}

export function formatearCelular(d: string): string {
  if (!d) return '';
  return `+57 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 10)}`.trim();
}

/** Claves fáciles de adivinar: 1234, 4321, 0000, 1111, 2580 (columna del teclado)... */
export function claveDebil(clave: string): boolean {
  if (/^(\d)\1{3}$/.test(clave)) return true;
  const n = clave.split('').map(Number);
  const sube = n.every((x, i) => i === 0 || x === n[i - 1] + 1);
  const baja = n.every((x, i) => i === 0 || x === n[i - 1] - 1);
  return sube || baja || ['2580', '0852', '1212', '6969', '1004'].includes(clave);
}
