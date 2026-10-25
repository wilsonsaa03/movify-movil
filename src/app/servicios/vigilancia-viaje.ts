import { distanciaKm } from './lugares.service';

export interface Punto {
  lat: number;
  lng: number;
}

export type Alerta = 'desvio' | 'detenido';

/** Fuera de la ruta más de esto (km) = posible desvío. Deja margen para calles paralelas y error del GPS. */
const MARGEN_RUTA_KM = 0.4;
/** Lecturas seguidas fuera de la ruta antes de preguntar (una sola puede ser un salto del GPS). */
const LECTURAS_DESVIO = 3;
/** Quieto (se movió menos de esto) durante MIN_DETENIDO = parada larga. */
const QUIETO_KM = 0.04;
const MIN_DETENIDO = 4;
/** Cerca del destino o de la parada es normal detenerse. */
const CERCA_KM = 0.25;
/** Después de preguntar, no se vuelve a preguntar lo mismo en este tiempo. */
const PAUSA_MIN = 8;

/**
 * "¿Todo bien?" de Uber y DiDi, del lado de la app del pasajero. Con cada posición del vehículo durante el
 * viaje decide si hay un desvío (varias lecturas lejos de la ruta planeada) o una parada larga (quieto
 * varios minutos lejos del destino). No sabe nada de pantallas: solo dice cuándo preguntar.
 */
export class VigilanciaViaje {
  private fuera = 0;
  private quietoDesde: { punto: Punto; t: number } | null = null;
  private ultimaPregunta: Record<Alerta, number> = { desvio: -Infinity, detenido: -Infinity };

  /**
   * @param plan la ruta planeada al empezar el viaje (OSRM).
   * @param metas el destino y la parada (si hay): detenerse cerca de ellas es normal.
   */
  constructor(
    private plan: Punto[],
    private metas: Punto[],
  ) {}

  /** Cambió el destino o la parada: se planea de nuevo y se empieza a contar de cero. */
  replanear(plan: Punto[], metas: Punto[]): void {
    this.plan = plan;
    this.metas = metas;
    this.fuera = 0;
    this.quietoDesde = null;
  }

  /** @returns qué preguntar ahora, o null. `ahora` en milisegundos (Date.now()). */
  registrar(p: Punto, ahora: number): Alerta | null {
    const cercaDeMeta = this.metas.some((m) => distanciaKm(p, m) < CERCA_KM);

    // Desvío: lejos de todos los puntos de la ruta varias veces seguidas
    if (this.plan.length > 1 && !cercaDeMeta) {
      const lejos = distanciaARuta(p, this.plan) > MARGEN_RUTA_KM;
      this.fuera = lejos ? this.fuera + 1 : 0;
      if (this.fuera >= LECTURAS_DESVIO && this.puedePreguntar('desvio', ahora)) {
        this.fuera = 0;
        this.ultimaPregunta.desvio = ahora;
        return 'desvio';
      }
    } else {
      this.fuera = 0;
    }

    // Parada larga: casi en el mismo sitio varios minutos
    if (!this.quietoDesde || distanciaKm(p, this.quietoDesde.punto) > QUIETO_KM) {
      this.quietoDesde = { punto: p, t: ahora };
      return null;
    }
    if (!cercaDeMeta && ahora - this.quietoDesde.t >= MIN_DETENIDO * 60_000 && this.puedePreguntar('detenido', ahora)) {
      this.ultimaPregunta.detenido = ahora;
      this.quietoDesde = { punto: p, t: ahora };
      return 'detenido';
    }
    return null;
  }

  private puedePreguntar(a: Alerta, ahora: number): boolean {
    return ahora - this.ultimaPregunta[a] >= PAUSA_MIN * 60_000;
  }
}

/** Distancia (km) del punto al tramo más cercano de la ruta. */
export function distanciaARuta(p: Punto, ruta: Punto[]): number {
  let min = Infinity;
  for (let i = 1; i < ruta.length; i++) min = Math.min(min, distanciaATramo(p, ruta[i - 1], ruta[i]));
  return ruta.length === 1 ? distanciaKm(p, ruta[0]) : min;
}

/** Proyección plana (suficiente dentro de una ciudad). */
function distanciaATramo(p: Punto, a: Punto, b: Punto): number {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110.57;
  const ax = (a.lng - p.lng) * kx;
  const ay = (a.lat - p.lat) * ky;
  const bx = (b.lng - p.lng) * kx;
  const by = (b.lat - p.lat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const largo = dx * dx + dy * dy;
  const t = largo === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}
