import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { RespuestaSesion, SesionService } from '../core/sesion.service';

export type Rol = 'cliente' | 'conductor';

export interface DatosPersonales {
  nombre: string;
  apellido: string;
  correo: string; // opcional: '' si no lo escribió
  foto: string | null; // dataURL de la foto (opcional)
}

/**
 * Guarda lo que el usuario va llenando en los 4 pasos del registro
 * (celular → código → datos → clave) para que no se pierda al cambiar de pantalla,
 * y hace las llamadas al backend:
 *   1. POST /auth/codigo            { celular, proposito: "registro" }
 *   2. POST /auth/codigo/verificar  → verificacionToken
 *   3. POST /auth/registro-movil    → sesión (token + refreshToken)
 *   4. POST /usuarios/perfil/foto   (solo si eligió foto)
 *
 * Los métodos lanzan el error HTTP tal cual; las páginas muestran ApiService.mensaje(err).
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

  /** Prueba de que el celular se verificó por SMS; dura poco y solo sirve para registro-movil. */
  private verificacionToken = '';

  /** "3001234567" → "+57 300 123 4567" */
  readonly celularVisible = computed(() => formatearCelular(this.celular()));

  iniciar(rol: Rol): void {
    this.rol.set(rol);
    this.celular.set('');
    this.celularVerificado.set(false);
    this.datos.set(null);
    this.cuentaCreada.set(false);
    this.verificacionToken = '';
  }

  // ---------------- Llamadas a la API ----------------

  /** Si el número ya tiene cuenta el backend responde 409 ("Ya existe una cuenta con ese celular"). */
  async enviarCodigo(celular: string): Promise<void> {
    const r = await this.api.post<{ codigoDesarrollo?: string }>('/auth/codigo', {
      celular,
      proposito: 'registro',
    });
    // Solo llega con SMS_CONSOLA=true en el backend (desarrollo)
    if (r.codigoDesarrollo) console.info(`[MoviFY dev] Código SMS: ${r.codigoDesarrollo}`);
    this.celular.set(celular);
    this.celularVerificado.set(false);
    this.verificacionToken = '';
  }

  /** Código errado, vencido o demasiados intentos → lanza el error con el mensaje del backend. */
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

  /** La clave viaja al backend, que la guarda con hash (BCrypt). Nunca se guarda en el celular. */
  async crearCuenta(clave: string): Promise<void> {
    const d = this.datos();
    const res = await this.api.post<RespuestaSesion>('/auth/registro-movil', {
      verificacionToken: this.verificacionToken,
      rol: this.rol() ?? 'cliente',
      nombres: d?.nombre ?? '',
      apellidos: d?.apellido ?? '',
      correo: d?.correo || null,
      clave,
      aceptaTerminos: true, // se marcó en el paso 3; sin eso no se llega aquí
    });
    this.sesion.guardar(res);
    this.verificacionToken = '';
    this.cuentaCreada.set(true);

    // La foto es opcional: si falla, la cuenta ya quedó creada y la puede subir luego desde el perfil
    if (d?.foto) {
      try {
        await this.subirFoto(d.foto);
      } catch (err) {
        console.warn('No se pudo subir la foto de perfil', err);
      }
    }
  }

  /** El backend guarda el archivo y deja su dirección en usuarios.foto_url. */
  private async subirFoto(dataUrl: string): Promise<void> {
    const blob = await (await fetch(dataUrl)).blob();
    const r = await this.api.postArchivo<{ foto: string }>('/usuarios/perfil/foto', 'foto', blob, 'foto.jpg');
    this.sesion.actualizarFoto(r.foto);
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
