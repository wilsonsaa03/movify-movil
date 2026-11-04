import { Injectable, inject } from '@angular/core';
import { ApiService } from '../core/api.service';

/** Un documento vigente del conductor (GET /api/conductor/mi-perfil → documentos). */
export interface DocumentoConductor {
  id: number;
  tipo_documento: string;
  nombre: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'vencido' | string;
  estado_nombre: string;
  observacion: string | null;
  fecha_vencimiento: string | null; // "2026-11-05"
}

/** GET /api/conductor/mi-perfil (los campos que usa el perfil). */
export interface MiPerfilConductor {
  estado: string;
  estado_nombre: string;
  motivo_estado: string | null;
  /** V17: su presentación corta (la ve el pasajero asignado). */
  sobre_mi: string | null;
  /** Lo que puede recibir según su vehículo (tabla servicio_vehiculo_permitido). */
  servicios_autorizados: { codigo: 'transporte' | 'domicilio' | 'encomienda' | string; nombre: string; descripcion: string | null }[];
  calificacion_promedio: number | null;
  total_calificaciones: number | null;
  total_servicios: number | null;
  categorias_licencia: string[];
  vehiculo: {
    tipo_vehiculo: 'moto' | 'taxi';
    placa: string;
    marca: string;
    linea: string | null;
    modelo_anio: number;
    color: string;
    empresa_afiliadora: string | null;
    numero_interno: string | null;
    cilindraje_cc: number | null;
    /** Moto: lleva casco para el pasajero (si no, no le llegan viajes que lo piden). */
    casco_pasajero: boolean | null;
  } | null;
  documentos: DocumentoConductor[];
}

/** GET /api/conductor/mi-desempeno */
export interface Desempeno {
  calificacion_promedio: number | null;
  total_calificaciones: number | null;
  /** Cuántas calificaciones de cada puntaje: { "5": 40, "4": 3, … } */
  estrellas: Record<string, number>;
  /** Los últimos 10 comentarios, sin el nombre del pasajero. */
  comentarios: { puntuacion: number; comentario: string; creado_en: string; tipo_servicio: string }[];
  total_servicios: number;
  total_cancelaciones: number;
  tasa_cancelacion: number;
  limite_cancelacion: number;
  minimo_cierres: number;
  sancionado: boolean;
  favoritos: number;
  conductor_desde: string | null;
  /** V17: elogios de los pasajeros, de más a menos ("Muy amable" ×12). */
  elogios: { elogio: string; veces: number }[];
}

/** GET /api/usuarios/bloqueados: personas desvinculadas (solo nombre de pila e inicial). */
export interface Desvinculado {
  id: number;
  nombre: string;
  motivo: string | null;
  creado_en: string;
}

/** Días antes del vencimiento en que se le avisa que renueve (como Uber/DiDi). */
export const DIAS_AVISO_VENCIMIENTO = 30;

/**
 * Perfil del conductor: datos y documentos (mi-perfil) y su desempeño (mi-desempeno).
 * Renovar un documento usa ConductorRegistroService.subir (el nuevo reemplaza al anterior y queda por revisar).
 */
@Injectable({ providedIn: 'root' })
export class ConductorPerfilService {
  private readonly api = inject(ApiService);

  perfil(): Promise<MiPerfilConductor> {
    return this.api.get<MiPerfilConductor>('/conductor/mi-perfil');
  }

  desempeno(): Promise<Desempeno> {
    return this.api.get<Desempeno>('/conductor/mi-desempeno');
  }

  /** Vacío = la borra. El backend rechaza teléfonos, correos y enlaces. */
  guardarSobreMi(texto: string): Promise<{ sobre_mi: string; message: string }> {
    return this.api.put('/conductor/sobre-mi', { texto });
  }

  desvinculados(): Promise<Desvinculado[]> {
    return this.api.get<Desvinculado[]>('/usuarios/bloqueados');
  }

  volverAVincular(id: number): Promise<unknown> {
    return this.api.borrar(`/usuarios/bloqueados/${id}`);
  }
}

/** "2026-11-05" → días que faltan desde hoy (negativo si ya venció). Fecha local, sin zona horaria. */
export function diasParaVencer(fecha: string | null, hoy = new Date()): number | null {
  if (!fecha) return null;
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  const vence = new Date(a, m - 1, d).getTime();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  return Math.round((vence - base) / 86400000);
}

/**
 * Cómo se ve un documento en el perfil y si hay que renovarlo:
 * vencido o rechazado → rojo y "Renovar"/"Corregir"; vence en ≤30 días → naranja y "Renovar"; lo demás, su estado.
 */
export function estadoDocumento(d: DocumentoConductor, hoy = new Date()): {
  clase: 'ok' | 'espera' | 'mal' | 'pronto';
  texto: string;
  detalle: string;
  accion: 'renovar' | 'corregir' | null;
} {
  const dias = diasParaVencer(d.fecha_vencimiento, hoy);
  const fecha = d.fecha_vencimiento ? fechaCorta(d.fecha_vencimiento) : '';
  if (d.estado === 'vencido' || (dias !== null && dias < 0)) {
    return { clase: 'mal', texto: 'Vencido', detalle: fecha ? `Venció el ${fecha}` : 'Ya no está vigente', accion: 'renovar' };
  }
  if (d.estado === 'rechazado') {
    return { clase: 'mal', texto: 'Rechazado', detalle: d.observacion || 'Súbelo otra vez para que lo revisemos', accion: 'corregir' };
  }
  if (dias !== null && dias <= DIAS_AVISO_VENCIMIENTO) {
    const cuando = dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`;
    return { clase: 'pronto', texto: cuando, detalle: `Vence el ${fecha}`, accion: d.estado === 'pendiente' ? null : 'renovar' };
  }
  if (d.estado === 'pendiente') return { clase: 'espera', texto: 'En revisión', detalle: 'Lo estamos revisando', accion: null };
  return { clase: 'ok', texto: 'Al día', detalle: fecha ? `Vence el ${fecha}` : 'Sin vencimiento', accion: null };
}

/** "2026-11-05" → "5 nov 2026". */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
}

/** Tasa de cancelación: verde hasta la mitad del límite, naranja cerca, rojo al pasarlo. */
export function nivelCancelacion(tasa: number, limite: number): 'bien' | 'cuidado' | 'mal' {
  if (tasa > limite) return 'mal';
  if (tasa > limite / 2) return 'cuidado';
  return 'bien';
}
