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
  /** De noche (21:00 a 5:00) corre el recargo nocturno de la tarifa. */
  nocturno: boolean;
  opciones: {
    tipo_vehiculo: TipoVehiculo;
    valor_estimado: number;
    /** % de recargo nocturno incluido en el precio (0 de día). */
    recargo_nocturno_pct: number;
    /** Lo máximo que se puede ofrecer por este viaje. */
    valor_maximo: number;
  }[];
}

/** POST /api/servicios (lo que usa la app). */
export interface SolicitudCreada {
  id: number;
  tarifa: number;
  conductores_notificados: number;
  expira_busqueda_en: string;
}

/** Si el viaje es para otra persona: a quien viaja le llega un SMS con el conductor, la placa y el PIN. */
export interface OtraPersona {
  nombre: string;
  telefono: string;
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
  // V14: viaje completo
  pasajeros?: number | null;
  /** Lo que cotizó MoviFY (tarifa puede ser mayor si el cliente ofreció más). */
  valor_sugerido?: number | null;
  aumentos_tarifa?: number | null;
  /** Solicitudes del conductor: el pasajero subió la tarifa. */
  tarifa_subida?: boolean | null;
  pasajero_nombre?: string | null;
  necesita_casco?: boolean | null;
  lleva_equipaje?: boolean | null;
  lleva_mascota?: boolean | null;
  parada?: string | null;
  parada_lat?: number | null;
  parada_lng?: number | null;
}

/** GET /api/servicios/cercanos: posición aproximada de los conductores libres (sin datos personales). */
export interface VehiculoCercano {
  lat: number;
  lng: number;
  tipo_vehiculo: TipoVehiculo;
}

/** GET /api/servicios/programados */
export interface ViajeProgramado {
  id: number;
  tipo_vehiculo: TipoVehiculo;
  origen: string;
  origen_barrio: string | null;
  destino: string;
  destino_barrio: string | null;
  pasajeros: number;
  necesita_casco: boolean;
  lleva_equipaje: boolean;
  lleva_mascota: boolean;
  pasajero_nombre: string | null;
  valor_cotizado: number | null;
  programado_para: string;
  estado: 'pendiente' | 'enviado' | 'cancelado' | 'fallido';
  servicio_id: number | null;
  motivo_fallo: string | null;
}

/** Motivos de cancelación del cliente (tabla motivos_cancelacion, actor cliente). */
export const MOTIVOS_CLIENTE: { id: number; texto: string }[] = [
  { id: 1, texto: 'Ya no necesito el viaje' },
  { id: 2, texto: 'El conductor tarda demasiado' },
  { id: 6, texto: 'El conductor no llega al punto' },
  { id: 3, texto: 'Me equivoqué en la dirección' },
  { id: 4, texto: 'Encontré otro medio de transporte' },
  { id: 5, texto: 'El conductor me pidió cancelar' },
];

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
  /** Una parada en el camino (opcional). */
  readonly parada = signal<Lugar | null>(null);
  readonly referencia = signal('');
  readonly nota = signal<NotaVoz | null>(null);
  readonly cotizacion = signal<Cotizacion | null>(null);
  // Preferencias (Uber: "Opciones del viaje")
  /** Moto: el pasajero no tiene casco. Solo se ofrece a motos que llevan uno. */
  readonly casco = signal(false);
  readonly pasajeros = signal(1);
  readonly equipaje = signal(false);
  readonly mascota = signal(false);
  readonly paraOtro = signal<OtraPersona | null>(null);
  /** Lo que ofrece pagar (inDrive): null = lo cotizado. */
  readonly ofrecido = signal<number | null>(null);
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
    const p = this.parada();
    const c = await this.api.get<Cotizacion>(
      `/tarifas/cotizar?tipo_servicio=transporte&origen_lat=${o.lat}&origen_lng=${o.lng}&destino_lat=${d.lat}&destino_lng=${d.lng}` +
        (p ? `&parada_lat=${p.lat}&parada_lng=${p.lng}` : ''),
    );
    const limpia: Cotizacion = {
      distancia_km: Number(c.distancia_km),
      duracion_min: Number(c.duracion_min),
      nocturno: !!c.nocturno,
      opciones: c.opciones.map((op) => ({
        tipo_vehiculo: op.tipo_vehiculo,
        valor_estimado: Number(op.valor_estimado),
        recargo_nocturno_pct: Number(op.recargo_nocturno_pct) || 0,
        valor_maximo: Number(op.valor_maximo) || Number(op.valor_estimado) * 2,
      })),
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

  /** Los carritos del mapa: conductores libres cerca (posición aproximada). */
  async cercanos(punto: { lat: number; lng: number }, tipo?: TipoVehiculo): Promise<VehiculoCercano[]> {
    try {
      const l = await this.api.get<VehiculoCercano[]>(
        `/servicios/cercanos?lat=${punto.lat}&lng=${punto.lng}` + (tipo ? `&tipo_vehiculo=${tipo}` : ''),
      );
      return l.map((v) => ({ lat: Number(v.lat), lng: Number(v.lng), tipo_vehiculo: v.tipo_vehiculo }));
    } catch {
      return [];
    }
  }

  /** Lo que se manda al pedir o al programar (origen, destino y preferencias). */
  private cuerpo(): Record<string, unknown> {
    const o = this.origen()!;
    const d = this.destino()!;
    const p = this.parada();
    const tipo = this.tipo();
    const otro = this.paraOtro();
    return {
      tipo: 'transporte',
      tipo_vehiculo: tipo,
      metodo_pago: 'efectivo',
      pasajeros: tipo === 'taxi' ? this.pasajeros() : 1,
      necesita_casco: tipo === 'moto' && this.casco(),
      lleva_equipaje: tipo === 'taxi' && this.equipaje(),
      lleva_mascota: tipo === 'taxi' && this.mascota(),
      pasajero_nombre: otro?.nombre ?? null,
      pasajero_telefono: otro?.telefono ?? null,
      origen_lat: o.lat,
      origen_lng: o.lng,
      origen: o.detalle ?? o.nombre,
      origen_barrio: o.barrio,
      origen_referencia: this.referencia().trim() || null,
      destino_lat: d.lat,
      destino_lng: d.lng,
      destino: d.detalle ? `${d.nombre}, ${d.detalle}` : d.nombre,
      destino_barrio: d.barrio,
      parada: p ? (p.detalle ? `${p.nombre}, ${p.detalle}` : p.nombre) : null,
      parada_lat: p?.lat ?? null,
      parada_lng: p?.lng ?? null,
    };
  }

  /** Crea el servicio y, si grabó nota de voz, la sube (si la nota falla, el viaje igual queda pedido). */
  async pedir(): Promise<SolicitudCreada> {
    const tipo = this.tipo();
    const s = await this.api.post<SolicitudCreada>('/servicios', { ...this.cuerpo(), valor_ofrecido: this.ofrecido() });
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

  /** Programa el viaje para más tarde (la búsqueda arranca unos minutos antes). */
  programar(para: Date): Promise<{ id: number; message: string }> {
    const c = this.cuerpo();
    delete c['tipo'];
    delete c['metodo_pago'];
    delete c['parada'];
    delete c['parada_lat'];
    delete c['parada_lng'];
    return this.api.post('/servicios/programados', { ...c, programado_para: para.toISOString() });
  }

  programados(): Promise<ViajeProgramado[]> {
    return this.api.get<ViajeProgramado[]>('/servicios/programados');
  }

  cancelarProgramado(id: number): Promise<unknown> {
    return this.api.borrar(`/servicios/programados/${id}`);
  }

  /** Nadie acepta: ofrecer más. La búsqueda se reinicia con el precio nuevo. */
  subirTarifa(id: number, valor: number): Promise<{ tarifa: number; expira_busqueda_en: string; conductores_notificados: number; message: string }> {
    return this.api.post(`/servicios/${id}/tarifa`, { valor });
  }

  detalle(id: number): Promise<DetalleServicio> {
    return this.api.get<DetalleServicio>(`/servicios/${id}`);
  }

  cancelar(id: number, motivoId?: number | null): Promise<unknown> {
    return this.api.post(`/servicios/${id}/estado`, { estado: 'cancelado', motivo_id: motivoId ?? null });
  }

  /** El servicio en curso del cliente (204 = ninguno → null). */
  async activo(): Promise<DetalleServicio | null> {
    return (await this.api.get<DetalleServicio | null>('/servicios/activo')) ?? null;
  }

  /** Después de pedir (o cancelar) se limpia lo que se estaba armando. Las preferencias de casco quedan. */
  olvidar(): void {
    this.destino.set(null);
    this.parada.set(null);
    this.referencia.set('');
    this.ponerNota(null);
    this.cotizacion.set(null);
    this.paraOtro.set(null);
    this.ofrecido.set(null);
    this.pasajeros.set(1);
    this.equipaje.set(false);
    this.mascota.set(false);
  }
}

function extension(mime: string): string {
  if (mime.includes('mp4')) return '.m4a';
  if (mime.includes('ogg')) return '.ogg';
  return '.webm';
}
