import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, ErrorApi } from '../core/api.service';
import { formatearCelular } from './registro.service';

/**
 * Recuperar clave (4 pasos + listo). Reutiliza el SMS del backend con propósito "login":
 *
 *   1. POST /auth/codigo            { celular, proposito: "login" }
 *   2. POST /auth/codigo/verificar  { celular, proposito: "login", codigo } → verificacionToken
 *   3. POST /auth/clave/restablecer { verificacionToken, clave }
 *
 * El backend no revela si el número tiene cuenta: responde igual y simplemente no envía el SMS.
 * La respuesta de /clave/restablecer trae una sesión, pero aquí no se guarda: la pantalla final
 * dice "ya puedes entrar con tu nueva clave" y lleva a escribirla.
 */
@Injectable({ providedIn: 'root' })
export class RecuperarService {
  private readonly api = inject(ApiService);

  readonly celular = signal(''); // 10 dígitos, sin +57
  readonly codigoVerificado = signal(false);
  readonly claveCambiada = signal(false);
  /** Solo en desarrollo (SMS_CONSOLA=true): el código llega en la respuesta. */
  readonly codigoDesarrollo = signal<string | null>(null);
  private verificacionToken: string | null = null;

  readonly celularVisible = computed(() => formatearCelular(this.celular()));

  iniciar(celular = ''): void {
    this.celular.set(celular);
    this.codigoVerificado.set(false);
    this.claveCambiada.set(false);
    this.codigoDesarrollo.set(null);
    this.verificacionToken = null;
  }

  async enviarCodigo(celular: string): Promise<void> {
    const r = await this.api.post<{ codigoDesarrollo?: string }>('/auth/codigo', { celular, proposito: 'login' });
    this.celular.set(celular);
    this.codigoVerificado.set(false);
    this.verificacionToken = null;
    this.codigoDesarrollo.set(r.codigoDesarrollo ?? null);
  }

  /** Lanza ErrorApi si el código no es correcto (el mensaje dice cuántos intentos quedan). */
  async verificarCodigo(codigo: string): Promise<void> {
    const r = await this.api.post<{ verificacionToken: string }>('/auth/codigo/verificar', {
      celular: this.celular(),
      proposito: 'login',
      codigo,
    });
    this.verificacionToken = r.verificacionToken;
    this.codigoVerificado.set(true);
  }

  async cambiarClave(clave: string): Promise<void> {
    if (!this.verificacionToken) throw new ErrorApi('Vuelve a pedir el código', 400);
    await this.api.post('/auth/clave/restablecer', { verificacionToken: this.verificacionToken, clave });
    this.verificacionToken = null;
    this.claveCambiada.set(true);
  }
}
