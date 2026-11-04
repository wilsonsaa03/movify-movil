import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { SesionService } from '../core/sesion.service';
import { NombreIcono } from '../componentes/icono/icono.component';

export type PeriodoGanancias = 'hoy' | 'semana' | 'mes';

/** Una barra de la gráfica: bloque de 3 horas (hoy) o un día (semana y mes). Hora de Colombia, sin zona. */
export interface BarraGanancias {
  desde: string; // "2026-10-25T15:00"
  valor: number;
  viajes: number;
}

/** GET /api/transporte/ganancias-resumen/{id}?periodo= */
export interface ResumenGanancias {
  periodo: PeriodoGanancias;
  total: number;
  viajes: number;
  km: number;
  minutos: number;
  promedio: number;
  anterior: number;
  /** % contra el periodo anterior hasta la misma hora; null si el anterior fue cero. */
  tendencia: number | null;
  barras: BarraGanancias[];
  por_tipo: { tipo: string; valor: number; viajes: number }[];
}

/** Meta del día que el conductor elige (se guarda en el celular). */
export const META_POR_DEFECTO = 80000;
export const META_MIN = 10000;
export const META_MAX = 1000000;
const CLAVE_META = 'movify.meta_dia';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const INICIAL_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/**
 * Ganancias del conductor (pantalla "Ganancias" y la meta del inicio). Todo se cobra en efectivo: lo ganado es la
 * suma de los servicios finalizados, no hay saldo en la app para retirar.
 */
@Injectable({ providedIn: 'root' })
export class GananciasService {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);

  readonly meta = signal(leerMeta());

  resumen(periodo: PeriodoGanancias): Promise<ResumenGanancias> {
    const id = this.sesion.datos()?.id;
    if (!id) return Promise.reject(new Error('Inicia sesión otra vez.'));
    return this.api.get<ResumenGanancias>(`/transporte/ganancias-resumen/${id}?periodo=${periodo}`);
  }

  /** Redondea a miles y la deja entre $10.000 y $1.000.000. Devuelve la meta guardada. */
  guardarMeta(valor: number): number {
    const m = metaValida(valor);
    this.meta.set(m);
    try {
      localStorage.setItem(CLAVE_META, String(m));
    } catch {
      // sin almacenamiento (modo privado): la meta dura mientras la app esté abierta
    }
    return m;
  }
}

export function metaValida(valor: number): number {
  const n = Math.round((Number(valor) || 0) / 1000) * 1000;
  return Math.min(META_MAX, Math.max(META_MIN, n));
}

function leerMeta(): number {
  try {
    const guardada = Number(localStorage.getItem(CLAVE_META));
    return guardada ? metaValida(guardada) : META_POR_DEFECTO;
  } catch {
    return META_POR_DEFECTO;
  }
}

/** "2026-10-25T15:00" → partes locales (sin pasar por la zona horaria del celular). */
function partes(desde: string): { fecha: Date; hora: number } {
  const [d, h = '00:00'] = desde.split('T');
  const [a, m, dia] = d.split('-').map(Number);
  return { fecha: new Date(a, m - 1, dia), hora: Number(h.split(':')[0]) };
}

function horaCorta(h: number): string {
  const doce = h % 12 || 12;
  return `${doce}${h < 12 ? 'a' : 'p'}`;
}

/** Letrero bajo la barra: "3p" (hoy), "L" (semana), "5" (mes; solo cada 5 días para que quepa). */
export function etiquetaBarra(desde: string, periodo: PeriodoGanancias): string {
  const { fecha, hora } = partes(desde);
  if (periodo === 'hoy') return horaCorta(hora);
  if (periodo === 'semana') return INICIAL_DIA[fecha.getDay()];
  const d = fecha.getDate();
  return d === 1 || d % 5 === 0 ? String(d) : '';
}

/** Para el lector de pantalla y el detalle de la barra: "3 p. m. a 6 p. m." o "martes 21". */
export function nombreBarra(desde: string, periodo: PeriodoGanancias): string {
  const { fecha, hora } = partes(desde);
  if (periodo === 'hoy') {
    const fmt = (h: number) => `${h % 12 || 12} ${h < 12 ? 'a. m.' : 'p. m.'}`;
    return `De ${fmt(hora)} a ${fmt((hora + 3) % 24)}`;
  }
  const dia = DIAS[fecha.getDay()];
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${fecha.getDate()}`;
}

/** ¿La barra es la del momento actual? (para resaltarla). */
export function esBarraActual(desde: string, periodo: PeriodoGanancias, ahora = new Date()): boolean {
  const { fecha, hora } = partes(desde);
  const mismoDia = fecha.toDateString() === new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toDateString();
  if (periodo !== 'hoy') return mismoDia;
  return mismoDia && ahora.getHours() >= hora && ahora.getHours() < hora + 3;
}

/** 200 → "3 h 20 min"; 45 → "45 min". */
export function duracion(minutos: number): string {
  const m = Math.max(0, Math.round(Number(minutos) || 0));
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

/** Nombre e ícono de cada tipo del desglose (taxi, moto, domicilio, encomienda). */
export function tipoGanancia(tipo: string): { nombre: string; icono: NombreIcono; tono: string } {
  switch (tipo) {
    case 'taxi':
      return { nombre: 'Viajes en taxi', icono: 'taxi', tono: 'amarillo' };
    case 'domicilio':
      return { nombre: 'Domicilios', icono: 'domicilio', tono: 'naranja' };
    case 'encomienda':
      return { nombre: 'Encomiendas', icono: 'encomienda', tono: 'naranja' };
    default:
      return { nombre: 'Viajes en moto', icono: 'moto', tono: 'teal' };
  }
}
