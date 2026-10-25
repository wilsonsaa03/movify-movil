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
  // V14
  /** La moto lleva casco para el pasajero. */
  conductor_casco?: boolean | null;
  /** Hay foto del vehículo (GET /servicios/{id}/vehiculo/foto). */
  conductor_vehiculo_foto?: boolean | null;
  conductor_viajes?: number | null;
  /** Solo para quien pidió: el conductor está en sus favoritos. */
  es_favorito?: boolean | null;
  /** Hasta cuándo espera el conductor en la recogida (después puede marcar "no se presentó"). */
  espera_hasta?: string | null;
  mensajes_sin_leer?: number | null;
  destino_cambiado_en?: string | null;
  pasajero_telefono?: string | null;
}

/** GET /api/servicios/{id}/mensajes */
export interface Mensaje {
  id: number;
  mio: boolean;
  contenido: string;
  creado_en: string;
  leido_en: string | null;
}

/** Motivos del conductor (tabla motivos_cancelacion, actor conductor). */
export const MOTIVOS_CONDUCTOR: { id: number; texto: string }[] = [
  { id: 10, texto: 'El pasajero no se presentó' },
  { id: 12, texto: 'La dirección de recogida está mal' },
  { id: 11, texto: 'Problema con el vehículo' },
  { id: 13, texto: 'Me sentí inseguro' },
];

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

  cancelar(id: number, motivoId?: number | null): Promise<unknown> {
    return this.api.post(`/servicios/${id}/estado`, { estado: 'cancelado', motivo_id: motivoId ?? null });
  }

  // ---------- Chat dentro de la app (el número no se muestra) ----------

  mensajes(id: number): Promise<Mensaje[]> {
    return this.api.get<Mensaje[]>(`/servicios/${id}/mensajes`);
  }

  enviarMensaje(id: number, contenido: string): Promise<{ id: number }> {
    return this.api.post(`/servicios/${id}/mensajes`, { contenido });
  }

  // ---------- Opciones del pasajero ----------

  /** Enlace para que la familia siga el viaje en vivo en el navegador (sin cuenta). */
  compartir(id: number): Promise<{ url: string; token: string; expira_en: string }> {
    return this.api.post(`/servicios/${id}/compartir`, {});
  }

  cambiarDestino(
    id: number,
    d: { destino: string; destino_barrio: string | null; destino_lat: number; destino_lng: number; parada?: string | null; parada_lat?: number | null; parada_lng?: number | null },
  ): Promise<{ tarifa: number; distancia_km: number; duracion_min: number; message: string }> {
    return this.api.post(`/servicios/${id}/destino`, d);
  }

  /** Respuesta al "¿Todo bien?" cuando la app ve un desvío o una parada larga. */
  alerta(id: number, tipo: 'desvio' | 'detenido', respuesta: 'estoy_bien' | 'sos' | 'sin_respuesta', lat: number | null, lng: number | null): Promise<unknown> {
    return this.api.post(`/servicios/${id}/alertas`, { tipo, respuesta, lat, lng });
  }

  favorito(id: number, marcar: boolean): Promise<{ es_favorito: boolean; message: string }> {
    return marcar ? this.api.put(`/servicios/${id}/favorito`, {}) : this.api.borrar(`/servicios/${id}/favorito`);
  }

  bloquear(id: number, motivo: string | null): Promise<{ message: string }> {
    return this.api.post(`/servicios/${id}/bloquear`, { motivo });
  }

  fotoVehiculo(id: number): Promise<Blob> {
    return this.api.blob(`/servicios/${id}/vehiculo/foto`);
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
