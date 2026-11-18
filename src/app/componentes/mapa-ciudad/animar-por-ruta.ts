/**
 * Cuentas para que el vehículo del mapa avance POR la ruta (la línea naranja) y no en línea recta.
 * Distancias en metros con una aproximación plana: en tramos de una ciudad el error es despreciable.
 */
export interface Punto {
  lat: number;
  lng: number;
}

/** Distancia máxima a la ruta para "pegarse" a ella (más lejos = se salió de la ruta, va en línea recta). */
export const PEGAR_A_RUTA_M = 40;

const M_POR_GRADO = 111_320;

export function metros(a: Punto, b: Punto): number {
  const x = (b.lng - a.lng) * M_POR_GRADO * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = (b.lat - a.lat) * M_POR_GRADO;
  return Math.hypot(x, y);
}

/** Punto de la ruta más cercano a p: en qué tramo (indice → indice+1), a qué fracción y a cuántos metros. */
export function proyectar(p: Punto, ruta: Punto[]): { indice: number; t: number; punto: Punto; distancia: number } {
  let mejor = { indice: 0, t: 0, punto: ruta[0], distancia: Number.POSITIVE_INFINITY };
  const cosLat = Math.cos(p.lat * (Math.PI / 180));
  for (let i = 0; i < ruta.length - 1; i++) {
    const a = ruta[i];
    const b = ruta[i + 1];
    const ax = (b.lng - a.lng) * cosLat;
    const ay = b.lat - a.lat;
    const px = (p.lng - a.lng) * cosLat;
    const py = p.lat - a.lat;
    const largo2 = ax * ax + ay * ay;
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, (px * ax + py * ay) / largo2));
    const q = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const d = metros(p, q);
    if (d < mejor.distancia) mejor = { indice: i, t, punto: q, distancia: d };
  }
  return mejor;
}

/**
 * Camino por el que se anima el vehículo de `desde` a `hasta`:
 *  - si los dos puntos están pegados a la ruta, los vértices de la ruta entre ellos (en el sentido que toque);
 *  - si no hay ruta o alguno se salió de ella, la línea recta.
 */
export function caminoPorRuta(desde: Punto, hasta: Punto, ruta: Punto[]): Punto[] {
  if (ruta.length < 2) return [desde, hasta];
  const a = proyectar(desde, ruta);
  const b = proyectar(hasta, ruta);
  if (a.distancia > PEGAR_A_RUTA_M || b.distancia > PEGAR_A_RUTA_M) return [desde, hasta];
  const posA = a.indice + a.t;
  const posB = b.indice + b.t;
  const camino: Punto[] = [a.punto];
  if (posB >= posA) {
    for (let i = a.indice + 1; i <= b.indice; i++) camino.push(ruta[i]);
  } else {
    for (let i = a.indice; i > b.indice; i--) camino.push(ruta[i]);
  }
  camino.push(b.punto);
  return camino;
}

/** Largo total del camino y el punto que va en la fracción f (0 = inicio, 1 = final). */
export function largo(camino: Punto[]): number {
  let total = 0;
  for (let i = 1; i < camino.length; i++) total += metros(camino[i - 1], camino[i]);
  return total;
}

// ───────────── Simulación de viajes (misma geometría que RutaSimulada.java del backend) ─────────────

/** Para la orientación se mira un poco antes y un poco después: gira suave en las esquinas. */
const MIRAR_ATRAS_M = 4;
const MIRAR_ADELANTE_M = 6;

export interface PosicionEnRuta {
  punto: Punto;
  /** 0 = norte, 90 = este (sentido horario). */
  rumbo: number;
  /** Metros desde el inicio de la ruta. */
  recorrido: number;
  /** Tramo (vértice i → i+1) en el que va. */
  tramo: number;
}

/** 0 = norte, 90 = este, 180 = sur, 270 = oeste. */
export function rumbo(a: Punto, b: Punto): number {
  const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = b.lat - a.lat;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

/**
 * Metros recorridos en `ahora` (ms): si corre, los de la marca + velocidad × tiempo; nunca pasa del final.
 * Es la misma cuenta que SimulacionViajes.recorridoEn del backend.
 */
export function recorridoEn(estado: string, recorridoMarca: number, marcaMs: number, velocidadKmh: number, distancia: number, ahoraMs: number): number {
  let s = recorridoMarca;
  if (estado === 'corriendo') s += ((velocidadKmh / 3.6) * Math.max(0, ahoraMs - marcaMs)) / 1000;
  return Math.max(0, Math.min(distancia, s));
}

/**
 * Polilínea de calles con sus distancias acumuladas: dado cuántos metros lleva el vehículo, da el punto
 * exacto SOBRE la ruta (interpolado dentro del tramo) y hacia dónde mira. El vehículo pasa por todos los
 * vértices en orden: nunca corta en línea recta.
 */
export class RutaMedida {
  readonly puntos: Punto[];
  private readonly acumulado: number[];

  constructor(puntos: Punto[]) {
    const limpios: Punto[] = [];
    for (const p of puntos) {
      if (!limpios.length || metros(limpios[limpios.length - 1], p) > 0.01) limpios.push(p);
    }
    if (!limpios.length) throw new Error('La ruta no tiene puntos');
    if (limpios.length === 1) limpios.push(limpios[0]);
    this.puntos = limpios;
    this.acumulado = [0];
    for (let i = 1; i < limpios.length; i++) this.acumulado.push(this.acumulado[i - 1] + metros(limpios[i - 1], limpios[i]));
  }

  get largo(): number {
    return this.acumulado[this.acumulado.length - 1];
  }

  acumuladoEn(i: number): number {
    return this.acumulado[i];
  }

  en(recorrido: number): PosicionEnRuta {
    const s = Math.max(0, Math.min(this.largo, recorrido));
    const i = this.tramo(s);
    return { punto: this.interpolar(i, s), rumbo: this.rumboEn(s), recorrido: s, tramo: i };
  }

  rumboEn(recorrido: number): number {
    const s = Math.max(0, Math.min(this.largo, recorrido));
    const a = Math.max(0, s - MIRAR_ATRAS_M);
    const b = Math.min(this.largo, s + MIRAR_ADELANTE_M);
    if (b - a < 0.5) {
      const i = Math.min(this.tramo(s), this.puntos.length - 2);
      return rumbo(this.puntos[i], this.puntos[i + 1]);
    }
    return rumbo(this.interpolar(this.tramo(a), a), this.interpolar(this.tramo(b), b));
  }

  /** Lo ya recorrido (inicio → posición), para pintarlo en gris. */
  hasta(recorrido: number): Punto[] {
    const p = this.en(recorrido);
    return [...this.puntos.slice(0, p.tramo + 1), p.punto];
  }

  private tramo(s: number): number {
    let lo = 0;
    let hi = this.acumulado.length - 1;
    if (s >= this.acumulado[hi]) return Math.max(0, hi - 1);
    while (hi - lo > 1) {
      const m = (lo + hi) >>> 1;
      if (this.acumulado[m] <= s) lo = m;
      else hi = m;
    }
    return lo;
  }

  private interpolar(i: number, s: number): Punto {
    const j = Math.min(i + 1, this.puntos.length - 1);
    const l = this.acumulado[j] - this.acumulado[i];
    const t = l <= 0 ? 0 : Math.max(0, Math.min(1, (s - this.acumulado[i]) / l));
    const a = this.puntos[i];
    const b = this.puntos[j];
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  }
}

export function puntoEn(camino: Punto[], f: number): Punto {
  if (camino.length === 1 || f <= 0) return camino[0];
  if (f >= 1) return camino[camino.length - 1];
  let falta = largo(camino) * f;
  for (let i = 1; i < camino.length; i++) {
    const tramo = metros(camino[i - 1], camino[i]);
    if (falta <= tramo) {
      const t = tramo === 0 ? 0 : falta / tramo;
      const a = camino[i - 1];
      const b = camino[i];
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    falta -= tramo;
  }
  return camino[camino.length - 1];
}
