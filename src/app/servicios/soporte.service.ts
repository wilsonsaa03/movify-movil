import { Injectable, inject } from '@angular/core';
import { ApiService } from '../core/api.service';
import { NombreIcono } from '../componentes/icono/icono.component';

/** Tipos de PQRS que acepta el backend (POST /api/pqrs). */
export type TipoSolicitud =
  | 'objeto_olvidado'
  | 'cobro_indebido'
  | 'incidente_seguridad'
  | 'queja'
  | 'reclamo'
  | 'peticion'
  | 'sugerencia';

/** Cómo se muestra cada tipo: lo más pedido primero, con palabras del día a día. */
export const TIPOS_SOLICITUD: { id: TipoSolicitud; nombre: string; detalle: string; icono: NombreIcono; conViaje: boolean }[] = [
  { id: 'objeto_olvidado', nombre: 'Olvidé algo', detalle: 'Dejé un objeto en el vehículo', icono: 'encomienda', conViaje: true },
  { id: 'cobro_indebido', nombre: 'Me cobraron mal', detalle: 'El valor no fue el acordado', icono: 'dinero', conViaje: true },
  { id: 'incidente_seguridad', nombre: 'Problema de seguridad', detalle: 'Me sentí inseguro o pasó algo grave', icono: 'escudo', conViaje: true },
  { id: 'queja', nombre: 'Queja', detalle: 'Algo no salió bien en un servicio', icono: 'alerta', conViaje: true },
  { id: 'reclamo', nombre: 'Reclamo', detalle: 'Quiero que se corrija algo', icono: 'lista', conViaje: false },
  { id: 'peticion', nombre: 'Petición', detalle: 'Necesito información o un trámite', icono: 'mensaje', conViaje: false },
  { id: 'sugerencia', nombre: 'Sugerencia', detalle: 'Una idea para mejorar MoviFY', icono: 'estrella', conViaje: false },
];

/** GET /api/pqrs */
export interface Solicitud {
  id: number;
  tipo: TipoSolicitud;
  asunto: string;
  descripcion: string;
  estado: 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado';
  estado_nombre: string;
  respuesta: string | null;
  servicio_id: number | null;
  fecha_limite_respuesta: string | null;
  creado_en: string;
  resuelto_en: string | null;
}

/** Ayuda y soporte (PQRS): crear, ver las propias y cerrarlas o reabrirlas cuando el equipo responde. */
@Injectable({ providedIn: 'root' })
export class SoporteService {
  private readonly api = inject(ApiService);

  crear(s: { tipo: TipoSolicitud; asunto: string; descripcion: string; servicioId: number | null }): Promise<{ id: number; message: string }> {
    return this.api.post<{ id: number; message: string }>('/pqrs', s);
  }

  mias(): Promise<Solicitud[]> {
    return this.api.get<Solicitud[]>('/pqrs');
  }

  /** La respuesta le sirvió (cerrar) o no (reabrir: vuelve a "en proceso"). */
  responder(id: number, cerrar: boolean): Promise<unknown> {
    return this.api.post(`/pqrs/${id}/${cerrar ? 'cerrar' : 'reabrir'}`, {});
  }
}

export function nombreTipo(t: TipoSolicitud): string {
  return TIPOS_SOLICITUD.find((x) => x.id === t)?.nombre ?? t;
}

/** "MV-0042" (el número que se le dice a soporte). */
export function numeroSolicitud(id: number): string {
  return 'MV-' + String(id).padStart(4, '0');
}
