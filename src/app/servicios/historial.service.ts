import { Injectable, inject } from '@angular/core';
import { ApiService } from '../core/api.service';
import { NombreIcono } from '../componentes/icono/icono.component';

/** GET /api/servicios/mios (fila de v_servicios_api, solo los campos que usan las pantallas). */
export interface Pedido {
  id: number;
  tipo_servicio: 'transporte' | 'domicilio' | 'encomienda';
  tipo_vehiculo: 'moto' | 'taxi';
  estado_codigo: 'buscando' | 'asignado' | 'en_origen' | 'en_curso' | 'finalizado' | 'cancelado' | 'expirado';
  estado_nombre: string;
  origen: string;
  destino: string;
  tarifa: number;
  descripcion: string | null;
  establecimiento: string | null;
  fecha_solicitud: string;
  fecha_fin: string | null;
  conductor_nombre: string | null;
  /** Solo en el detalle (GET /api/servicios/{id}). */
  conductor_placa?: string | null;
  /** Solo en el detalle: el conductor está en mis favoritos. */
  es_favorito?: boolean | null;
  distancia_km: number | null;
}

/** GET /api/servicios/{id}/historial: cada cambio de estado con su fecha y hora (tabla historial_estados). */
export interface CambioEstado {
  creado_en: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  estado_nombre: string;
  actor_rol: string | null;
  motivo: string | null;
}

/** El historial de servicios del cliente (HU 2.9) y la línea de tiempo de cada uno. */
@Injectable({ providedIn: 'root' })
export class HistorialService {
  private readonly api = inject(ApiService);

  mios(): Promise<Pedido[]> {
    return this.api.get<Pedido[]>('/servicios/mios');
  }

  detalle(id: number): Promise<Pedido> {
    return this.api.get<Pedido>(`/servicios/${id}`);
  }

  cambios(id: number): Promise<CambioEstado[]> {
    return this.api.get<CambioEstado[]>(`/servicios/${id}/historial`);
  }
}

/** "Viaje en taxi", "Domicilio", "Encomienda". */
export function nombreServicio(p: Pick<Pedido, 'tipo_servicio' | 'tipo_vehiculo'>): string {
  if (p.tipo_servicio === 'domicilio') return 'Domicilio';
  if (p.tipo_servicio === 'encomienda') return 'Encomienda';
  return p.tipo_vehiculo === 'taxi' ? 'Viaje en taxi' : 'Viaje en moto';
}

export function iconoServicio(p: Pick<Pedido, 'tipo_servicio' | 'tipo_vehiculo'>): NombreIcono {
  if (p.tipo_servicio === 'domicilio') return 'domicilio';
  if (p.tipo_servicio === 'encomienda') return 'encomienda';
  return p.tipo_vehiculo === 'taxi' ? 'taxi' : 'moto';
}

/** Finalizado (verde), cancelado (rojo) o en curso (naranja). */
export function claseEstado(estado: string): 'ok' | 'mal' | 'curso' {
  if (estado === 'finalizado') return 'ok';
  if (estado === 'cancelado' || estado === 'expirado') return 'mal';
  return 'curso';
}

/** "Hoy", "Ayer" o "jue 23 oct" (para agrupar la lista por día). */
export function dia(iso: string, hoy = new Date()): string {
  const f = new Date(iso);
  const sinHora = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((sinHora(hoy) - sinHora(f)) / 86400000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  const texto = f.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return f.getFullYear() === hoy.getFullYear() ? texto : `${texto} ${f.getFullYear()}`;
}

/** "jue 23 oct · 6:48 p. m." */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const f = new Date(iso);
  const d = f.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const h = f.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${d} · ${h}`;
}

/** Pantalla de seguimiento de un servicio que sigue en curso (para retomarlo desde el historial). */
export function seguimiento(p: Pick<Pedido, 'tipo_servicio' | 'estado_codigo'>): string | null {
  if (p.estado_codigo === 'buscando') return '/cliente/viaje/buscando';
  if (!['asignado', 'en_origen', 'en_curso'].includes(p.estado_codigo)) return null;
  if (p.tipo_servicio === 'domicilio') return '/cliente/domicilio/seguimiento';
  if (p.tipo_servicio === 'encomienda') return '/cliente/encomienda/seguimiento';
  return '/cliente/viaje/en-camino';
}
