import { Injectable, inject, signal } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { ApiService, ErrorApi } from '../core/api.service';

export interface RespuestaLlamada {
  /** twilio = suena de verdad; simulada = modo de prueba (sin Twilio Voice). */
  modo: 'twilio' | 'simulada';
  message: string;
}

/**
 * "Llamar" con número protegido (POST /api/servicios/{id}/llamar), como Uber y DiDi: MoviFY te llama y te comunica
 * con el otro. Ninguno ve el celular del otro (el backend ya no los envía).
 */
@Injectable({ providedIn: 'root' })
export class LlamadaService {
  private readonly api = inject(ApiService);
  private readonly avisos = inject(ToastController);
  readonly llamando = signal(false);

  async llamar(servicioId: number): Promise<RespuestaLlamada | null> {
    if (this.llamando() || !servicioId) return null;
    this.llamando.set(true);
    try {
      const r = await this.api.post<RespuestaLlamada>(`/servicios/${servicioId}/llamar`, {});
      await this.avisar(r.message, r.modo === 'twilio' ? 'success' : 'medium', 5000);
      return r;
    } catch (e) {
      await this.avisar((e as ErrorApi).message || 'No pudimos hacer la llamada. Usa el chat.', 'warning', 4000);
      return null;
    } finally {
      this.llamando.set(false);
    }
  }

  private async avisar(message: string, color: string, duration: number): Promise<void> {
    const t = await this.avisos.create({ message, color, duration, position: 'top' });
    await t.present();
  }
}
