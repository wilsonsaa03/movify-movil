import { Injectable, inject } from '@angular/core';
import { ApiService } from '../core/api.service';
import { UbicacionService } from './ubicacion.service';
import { DetalleServicio } from './viaje.service';

/** Cada cuánto el conductor con viaje manda su posición. */
const REPORTE_MS = 6000;

/** GET /api/servicios/{id}: lo que usan las pantallas del viaje en curso (conductor y pasajero). */
export interface ViajeActivo extends DetalleServicio {
  /** Solo lo ve el pasajero: el PIN que le dice al conductor para empezar. */
  codigo_abordaje?: string | null;
  /** Solo lo ve el conductor asignado (y el personal). */
  usuario_telefono?: string | null;
  valor_final?: number | null;
  descripcion?: string | null;
  establecimiento?: string | null;
  requiere_compra?: boolean | null;
  valor_productos_aprox?: number | null;
  conductor_id?: number | null;
  conductor_nombre: string | null;
  conductor_telefono: string | null;
  conductor_calificacion: number | null;
  conductor_placa: string | null;
  conductor_modelo: string | null;
  conductor_color: string | null;
  conductor_lat: number | null;
  conductor_lng: number | null;
}

/** Cambios de estado que da el conductor, con lo que pide cada uno. */
export interface Avance {
  estado: 'en_origen' | 'en_curso' | 'finalizado';
  codigo_abordaje?: string;
  codigo_entrega?: string;
  valor_compra_real?: number;
}

/**
 * Llamadas del viaje ya aceptado (el pasajero lo sigue, el conductor lo avanza):
 * asignado → en_origen ("Llegué") → en_curso (PIN) → finalizado.
 */
@Injectable({ providedIn: 'root' })
export class ViajeActivoService {
  private readonly api = inject(ApiService);
  private readonly gps = inject(UbicacionService);
  private reporte: ReturnType<typeof setInterval> | null = null;

  /**
   * Conductor con viaje: sigue el GPS y lo manda cada pocos segundos para que el pasajero vea el carro
   * moverse (en el inicio lo hace el sondeo de solicitudes; aquí, mientras dura el viaje).
   */
  empezarReporte(): void {
    if (this.reporte) return;
    this.gps.seguir();
    const enviar = () => {
      const u = this.gps.ubicacion();
      if (u) this.api.post('/conductor/ubicacion', { lat: u.lat, lng: u.lng }).catch(() => undefined);
    };
    enviar();
    this.reporte = setInterval(enviar, REPORTE_MS);
  }

  pararReporte(): void {
    if (!this.reporte) return;
    clearInterval(this.reporte);
    this.reporte = null;
    this.gps.dejarDeSeguir();
  }

  detalle(id: number): Promise<ViajeActivo> {
    return this.api.get<ViajeActivo>(`/servicios/${id}`);
  }

  avanzar(id: number, a: Avance): Promise<unknown> {
    return this.api.post(`/servicios/${id}/estado`, a);
  }

  cancelar(id: number): Promise<unknown> {
    return this.api.post(`/servicios/${id}/estado`, { estado: 'cancelado' });
  }

  calificar(id: number, puntuacion: number, comentario: string | null): Promise<unknown> {
    return this.api.post(`/servicios/${id}/calificar`, { puntuacion, comentario });
  }

  /** Botón SOS: avisa a soporte con la ubicación. */
  sos(id: number, lat: number | null, lng: number | null): Promise<{ message: string }> {
    return this.api.post<{ message: string }>('/sos', { servicio_id: id, lat, lng });
  }

  /** El servicio en curso de quien está en sesión (204 = ninguno → null). */
  async activo(): Promise<ViajeActivo | null> {
    return (await this.api.get<ViajeActivo | null>('/servicios/activo')) ?? null;
  }

  notaVoz(id: number): Promise<Blob> {
    return this.api.blob(`/servicios/${id}/nota-voz`);
  }
}

/** "Ana Valencia" → "AV" */
export function iniciales(nombre: string | null | undefined): string {
  return (nombre ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/** "Ana Valencia" → "Ana" */
export function primerNombre(nombre: string | null | undefined, siNo = ''): string {
  return (nombre ?? '').trim().split(/\s+/)[0] || siNo;
}

/** Solo dígitos y +, para tel: y sms: */
export function telefonoLimpio(t: string | null | undefined): string {
  return (t ?? '').replace(/[^\d+]/g, '');
}

/** Ruta del conductor según el estado del viaje (para retomarlo si cierra la app). */
export function pantallaConductor(v: Pick<ViajeActivo, 'estado_codigo' | 'tipo_servicio'>): string | null {
  switch (v.estado_codigo) {
    case 'asignado':
      return '/conductor/viaje/recogida';
    case 'en_origen':
      // En el viaje se pide el PIN para empezar; en domicilio y encomienda se sigue a "en viaje"
      return v.tipo_servicio === 'transporte' ? '/conductor/viaje/pin' : '/conductor/viaje/en-curso';
    case 'en_curso':
      return '/conductor/viaje/en-curso';
    default:
      return null;
  }
}
