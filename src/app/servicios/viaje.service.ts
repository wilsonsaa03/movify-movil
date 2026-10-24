import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { Lugar, distanciaKm } from './lugares.service';

export type TipoVehiculo = 'moto' | 'taxi';

export interface NotaVoz {
  blob: Blob;
  url: string; // object URL para escucharla antes de enviar
  segundos: number;
}

/** GET /api/tarifas/cotizar */
export interface Cotizacion {
  distancia_km: number;
  duracion_min: number;
  opciones: { tipo_vehiculo: TipoVehiculo; valor_estimado: number }[];
}

/** POST /api/servicios (lo que usa la app). */
export interface SolicitudCreada {
  id: number;
  tarifa: number;
  conductores_notificados: number;
  expira_busqueda_en: string;
}

/** GET /api/servicios/{id} (campos que usan las pantallas del viaje). */
export interface DetalleServicio {
  id: number;
  tipo_servicio: 'transporte' | 'domicilio' | 'encomienda';
  tipo_vehiculo: TipoVehiculo;
  /** Solo en encomiendas y solo para quien la pidió: el PIN que da quien recibe. */
  codigo_entrega?: string | null;
  estado_codigo: 'buscando' | 'asignado' | 'en_origen' | 'en_curso' | 'finalizado' | 'cancelado' | 'expirado';
  origen: string;
  origen_barrio: string | null;
  origen_referencia: string | null;
  destino: string;
  destino_barrio: string | null;
  origen_lat: number;
  origen_lng: number;
  destino_lat: number;
  destino_lng: number;
  distancia_km: number;
  duracion_estimada_min: number;
  tarifa: number;
  expira_busqueda_en: string | null;
  usuario_nombre: string;
  usuario_calificacion: number | null;
  usuario_verificado: boolean | null;
  nota_voz_segundos: number | null;
  /** Domicilio y encomienda (v_servicios_api): qué se lleva, dónde se compra y si hay que adelantar plata. */
  descripcion?: string | null;
  establecimiento?: string | null;
  requiere_compra?: boolean | null;
  valor_productos_aprox?: number | null;
  tamano?: 'pequeno' | 'mediano' | 'grande' | null;
  fragil?: boolean | null;
}

/** GET /api/transporte/conductores-activos */
interface ConductorLibre {
  latitud: number;
  longitud: number;
  tipo_vehiculo: TipoVehiculo;
}

/** Velocidad promedio en la ciudad para estimar en cuánto llega el conductor (≈ 20 km/h). */
const MIN_POR_KM = 3;

/**
 * El viaje que el cliente está armando (Viaje 2 → 3 → 4) y las llamadas al backend para pedirlo.
 * El borrador vive en memoria: si la app se cierra a mitad, se empieza de nuevo desde "¿A dónde vas?".
 * Una vez pedido, las pantallas trabajan con el id del servicio (sobrevive a recargar la página).
 */
@Injectable({ providedIn: 'root' })
export class ViajeService {
  private readonly api = inject(ApiService);

  readonly tipo = signal<TipoVehiculo>('moto');
  readonly origen = signal<Lugar | null>(null);
  readonly destino = signal<Lugar | null>(null);
  readonly referencia = signal('');
  readonly nota = signal<NotaVoz | null>(null);
  readonly cotizacion = signal<Cotizacion | null>(null);
  /** Respuesta de POST /api/servicios del último viaje pedido (para "Les avisamos a N conductores"). */
  readonly pedido = signal<(SolicitudCreada & { tipo: TipoVehiculo }) | null>(null);

  listoParaCotizar(): boolean {
    return !!this.origen() && !!this.destino();
  }

  ponerNota(n: NotaVoz | null): void {
    const anterior = this.nota();
    if (anterior && anterior.url !== n?.url) URL.revokeObjectURL(anterior.url);
    this.nota.set(n);
  }

  async cotizar(): Promise<Cotizacion> {
    const o = this.origen()!;
    const d = this.destino()!;
    const c = await this.api.get<Cotizacion>(
      `/tarifas/cotizar?tipo_servicio=transporte&origen_lat=${o.lat}&origen_lng=${o.lng}&destino_lat=${d.lat}&destino_lng=${d.lng}`,
    );
    const limpia: Cotizacion = {
      distancia_km: Number(c.distancia_km),
      duracion_min: Number(c.duracion_min),
      opciones: c.opciones.map((op) => ({ tipo_vehiculo: op.tipo_vehiculo, valor_estimado: Number(op.valor_estimado) })),
    };
    this.cotizacion.set(limpia);
    return limpia;
  }

  /**
   * Minutos que tardaría en llegar el conductor libre más cercano de cada tipo (null = no hay ninguno).
   * Es una estimación en línea recta; el backend decide a quién se le ofrece el viaje.
   */
  async llegadas(): Promise<Record<TipoVehiculo, number | null>> {
    const o = this.origen()!;
    const r: Record<TipoVehiculo, number | null> = { moto: null, taxi: null };
    try {
      const libres = await this.api.get<ConductorLibre[]>('/transporte/conductores-activos');
      for (const c of libres) {
        const km = distanciaKm(o, { lat: Number(c.latitud), lng: Number(c.longitud) }) * 1.3;
        const min = Math.max(1, Math.round(km * MIN_POR_KM));
        const t = c.tipo_vehiculo;
        if (t === 'moto' || t === 'taxi') r[t] = r[t] === null ? min : Math.min(r[t], min);
      }
    } catch {
      /* sin datos: la pantalla no muestra el tiempo de llegada */
    }
    return r;
  }

  /** Crea el servicio y, si grabó nota de voz, la sube (si la nota falla, el viaje igual queda pedido). */
  async pedir(): Promise<SolicitudCreada> {
    const o = this.origen()!;
    const d = this.destino()!;
    const tipo = this.tipo();
    const s = await this.api.post<SolicitudCreada>('/servicios', {
      tipo: 'transporte',
      tipo_vehiculo: tipo,
      metodo_pago: 'efectivo',
      pasajeros: 1,
      origen_lat: o.lat,
      origen_lng: o.lng,
      origen: o.detalle ?? o.nombre,
      origen_barrio: o.barrio,
      origen_referencia: this.referencia().trim() || null,
      destino_lat: d.lat,
      destino_lng: d.lng,
      destino: d.detalle ? `${d.nombre}, ${d.detalle}` : d.nombre,
      destino_barrio: d.barrio,
    });
    this.pedido.set({ ...s, tipo });

    const nota = this.nota();
    if (nota) {
      const form = new FormData();
      form.append('audio', nota.blob, 'nota' + extension(nota.blob.type));
      form.append('segundos', String(Math.round(nota.segundos)));
      await this.api.subir(`/servicios/${s.id}/nota-voz`, form, () => undefined).catch(() => undefined);
    }
    return s;
  }

  detalle(id: number): Promise<DetalleServicio> {
    return this.api.get<DetalleServicio>(`/servicios/${id}`);
  }

  cancelar(id: number): Promise<unknown> {
    return this.api.post(`/servicios/${id}/estado`, { estado: 'cancelado' });
  }

  /** El servicio en curso del cliente (204 = ninguno → null). */
  async activo(): Promise<DetalleServicio | null> {
    return (await this.api.get<DetalleServicio | null>('/servicios/activo')) ?? null;
  }

  /** Después de pedir (o cancelar) se limpia lo que se estaba armando. */
  olvidar(): void {
    this.destino.set(null);
    this.referencia.set('');
    this.ponerNota(null);
    this.cotizacion.set(null);
  }
}

function extension(mime: string): string {
  if (mime.includes('mp4')) return '.m4a';
  if (mime.includes('ogg')) return '.ogg';
  return '.webm';
}
