import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { SesionService } from './sesion.service';

/** Lo que manda el backend por /ws/tiempo-real (ver TiempoReal.java). */
export interface EventoTiempoReal {
  tipo: 'ubicacion' | 'mensaje' | 'estado' | 'simulacion' | 'pago' | 'evidencia' | string;
  servicio: number;
  [dato: string]: unknown;
}

type Oyente = (e: EventoTiempoReal) => void;

/** Ping para que ni el servidor ni un proxy cierren la conexión por inactividad. */
const PING_MS = 25_000;
const ESPERA_MAX_MS = 30_000;

/** ws://host:8080/ws/tiempo-real a partir de apiUrl (http://host:8080/api). */
export function urlTiempoReal(apiUrl: string): string {
  const u = new URL(apiUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = u.pathname.replace(/\/api\/?$/, '') + '/ws/tiempo-real';
  u.search = '';
  return u.toString();
}

/**
 * Avisos en tiempo real del servicio (ubicación del conductor, chat, estados, simulación, pago, foto de entrega).
 * Una sola conexión para toda la app: cada pantalla dice qué servicio sigue y recibe sus eventos.
 *
 * El token NO va en la URL: se manda en el primer mensaje ({ tipo: 'auth' }). Si la conexión se cae se reconecta
 * sola (espera creciente hasta 30 s); mientras tanto las pantallas siguen con su sondeo HTTP de siempre.
 * `conectado()` sirve para sondear más despacio cuando los avisos llegan solos.
 */
@Injectable({ providedIn: 'root' })
export class TiempoRealService {
  private readonly sesion = inject(SesionService);
  /** true cuando el backend ya aceptó el token. */
  readonly conectado = signal(false);

  private ws: WebSocket | null = null;
  private readonly oyentes = new Map<number, Set<Oyente>>();
  private ping: ReturnType<typeof setInterval> | null = null;
  private reintento: ReturnType<typeof setTimeout> | null = null;
  private espera = 1000;

  /**
   * Sigue un servicio. Devuelve la función para dejar de seguirlo (llamarla al salir de la pantalla).
   *   const dejar = this.tiempoReal.seguir(id, (e) => ...);
   */
  seguir(servicioId: number, oyente: Oyente): () => void {
    if (!servicioId) return () => undefined;
    let set = this.oyentes.get(servicioId);
    const nuevo = !set;
    if (!set) {
      set = new Set();
      this.oyentes.set(servicioId, set);
    }
    set.add(oyente);
    this.conectar();
    if (nuevo && this.conectado()) this.enviar({ tipo: 'seguir', servicio: servicioId });
    return () => this.dejar(servicioId, oyente);
  }

  private dejar(servicioId: number, oyente: Oyente): void {
    const set = this.oyentes.get(servicioId);
    if (!set) return;
    set.delete(oyente);
    if (set.size) return;
    this.oyentes.delete(servicioId);
    if (this.conectado()) this.enviar({ tipo: 'dejar', servicio: servicioId });
    // Sin nada que seguir se cierra la conexión (ahorra batería y datos)
    if (!this.oyentes.size) this.cerrar();
  }

  private conectar(): void {
    if (this.ws || typeof WebSocket === 'undefined' || !this.sesion.token) return;
    if (this.reintento) {
      clearTimeout(this.reintento);
      this.reintento = null;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(urlTiempoReal(environment.apiUrl));
    } catch {
      this.programarReintento();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      // Primer mensaje: el JWT de acceso (lo valida igual que la API)
      this.enviar({ tipo: 'auth', token: this.sesion.token });
    };
    ws.onmessage = (m) => this.recibir(m.data);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.conectado.set(false);
      this.pararPing();
      if (this.oyentes.size) this.programarReintento();
    };
    ws.onerror = () => ws.close();
  }

  private recibir(texto: unknown): void {
    let e: EventoTiempoReal;
    try {
      e = JSON.parse(String(texto)) as EventoTiempoReal;
    } catch {
      return;
    }
    if (e.tipo === 'listo') {
      this.conectado.set(true);
      this.espera = 1000;
      for (const id of this.oyentes.keys()) this.enviar({ tipo: 'seguir', servicio: id });
      this.pararPing();
      this.ping = setInterval(() => this.enviar({ tipo: 'ping' }), PING_MS);
      return;
    }
    if (typeof e.servicio !== 'number') return;
    for (const o of this.oyentes.get(e.servicio) ?? []) {
      try {
        o(e);
      } catch {
        /* una pantalla con error no corta los avisos de las demás */
      }
    }
  }

  private enviar(datos: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(datos));
  }

  private programarReintento(): void {
    if (this.reintento) return;
    this.reintento = setTimeout(() => {
      this.reintento = null;
      this.conectar();
    }, this.espera);
    this.espera = Math.min(ESPERA_MAX_MS, this.espera * 2);
  }

  private pararPing(): void {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
  }

  private cerrar(): void {
    this.pararPing();
    if (this.reintento) clearTimeout(this.reintento);
    this.reintento = null;
    const ws = this.ws;
    this.ws = null;
    this.conectado.set(false);
    ws?.close();
  }
}
