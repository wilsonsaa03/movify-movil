import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';

/** GET /api/notificaciones → items */
export interface Notificacion {
  id: number;
  tipo: 'nueva_solicitud' | 'estado_servicio' | 'mensaje' | 'verificacion' | 'documento_por_vencer' | 'soporte' | 'sos' | 'sistema';
  titulo: string;
  cuerpo: string;
  servicio_id: number | null;
  /** asignado, en_origen, finalizado, mensaje, solicitud, soporte… (lo mismo que trae el push). */
  evento: string | null;
  leida_en: string | null;
  creado_en: string;
  tipo_servicio: 'transporte' | 'domicilio' | 'encomienda' | null;
  tipo_vehiculo: 'moto' | 'taxi' | null;
}

/**
 * Las notificaciones de quien está en sesión: las mismas que llegan por push, guardadas en el backend para
 * verlas después (si el push no llegó o se borró). Lleva el número de no leídas para la campana del inicio.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private readonly api = inject(ApiService);

  /** Para la campana: se actualiza al abrir el inicio, al leer y al marcar todas. */
  readonly noLeidas = signal(0);

  async pagina(pagina: number): Promise<{ items: Notificacion[]; hay_mas: boolean }> {
    const r = await this.api.get<{ items: Notificacion[]; hay_mas: boolean; no_leidas: number }>(`/notificaciones?pagina=${pagina}&tamano=30`);
    this.noLeidas.set(Number(r.no_leidas) || 0);
    return r;
  }

  async contar(): Promise<number> {
    try {
      const r = await this.api.get<{ no_leidas: number }>('/notificaciones/no-leidas');
      this.noLeidas.set(Number(r.no_leidas) || 0);
    } catch {
      /* sin conexión: se deja el número que había */
    }
    return this.noLeidas();
  }

  async leida(id: number): Promise<void> {
    const r = await this.api.post<{ no_leidas: number }>(`/notificaciones/${id}/leida`, {});
    this.noLeidas.set(Number(r.no_leidas) || 0);
  }

  async leerTodas(): Promise<void> {
    await this.api.post('/notificaciones/leer-todas', {});
    this.noLeidas.set(0);
  }
}

/** "Hoy", "Ayer" o "mar. 21 oct." para agrupar la lista. */
export function grupoDia(iso: string, ahora = new Date()): string {
  const f = new Date(iso);
  const inicio = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicio(ahora) - inicio(f)) / 86400000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).format(f);
}

/** "Hace 5 min", "Hace 2 h" o la hora ("6:42 p. m.") si fue antes de ayer. */
export function haceCuanto(iso: string, ahora = Date.now()): string {
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  if (min < 24 * 60) return `Hace ${Math.floor(min / 60)} h`;
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
