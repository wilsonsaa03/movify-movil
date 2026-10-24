import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { NombreIcono } from '../componentes/icono/icono.component';
import { Lugar } from './lugares.service';
import { PasoHistorial } from './encomienda.service';

/** Figma "Domicilio 1 · Pedido": ¿Qué es? */
export type Categoria = 'comida' | 'farmacia' | 'mercado' | 'diligencia';

export const CATEGORIAS: { id: Categoria; nombre: string; icono: NombreIcono }[] = [
  { id: 'comida', nombre: 'Comida', icono: 'comida' },
  { id: 'farmacia', nombre: 'Farmacia', icono: 'farmacia' },
  { id: 'mercado', nombre: 'Mercado', icono: 'mercado' },
  { id: 'diligencia', nombre: 'Diligencia', icono: 'diligencia' },
];

/** Lo máximo que el domiciliario adelanta de su bolsillo (el mismo tope del backend). */
export const TOPE_COMPRA = 500000;

/** Minutos que se suman cuando el domiciliario tiene que comprar (hacer la fila y pagar). */
export const MIN_COMPRA = 10;

export interface DomicilioCreado {
  id: number;
  tarifa: number;
  conductores_notificados: number;
  expira_busqueda_en: string;
}

/** GET /api/servicios/{id} (lo que usan Seguimiento y Entregado). */
export interface DetalleDomicilio {
  id: number;
  tipo_servicio: string;
  estado_codigo: 'buscando' | 'asignado' | 'en_origen' | 'en_curso' | 'finalizado' | 'cancelado' | 'expirado';
  origen: string;
  destino: string;
  destino_barrio: string | null;
  origen_lat: number;
  origen_lng: number;
  destino_lat: number;
  destino_lng: number;
  tarifa: number;
  descripcion: string | null;
  establecimiento: string | null;
  categoria: Categoria | null;
  requiere_compra: boolean | null;
  valor_productos_aprox: number | null;
  valor_compra_real: number | null;
  conductor_nombre: string | null;
  conductor_telefono: string | null;
  conductor_calificacion: number | null;
  conductor_placa: string | null;
  conductor_modelo: string | null;
  conductor_color: string | null;
  conductor_lat: number | null;
  conductor_lng: number | null;
}

/**
 * El domicilio que el cliente está armando (Domicilio 1 → 2) y las llamadas para pedirlo y seguirlo.
 * RECOGER EN es la tienda (origen del servicio) y ENTREGAR EN la casa del cliente (destino).
 */
@Injectable({ providedIn: 'root' })
export class DomicilioService {
  private readonly api = inject(ApiService);

  readonly tienda = signal<Lugar | null>(null);
  readonly entrega = signal<Lugar | null>(null);
  readonly categoria = signal<Categoria | null>(null);
  readonly descripcion = signal('');
  /** ¿Quién paga el pedido en la tienda? true = el domiciliario (y el cliente le devuelve al recibir). */
  readonly pagaDomiciliario = signal(false);
  readonly valorPedido = signal<number | null>(null);
  readonly tarifa = signal<number | null>(null);
  readonly pedido = signal<DomicilioCreado | null>(null);

  readonly opcionCategoria = computed(() => CATEGORIAS.find((c) => c.id === this.categoria()) ?? null);
  /** Lo que se paga al recibir: domicilio + (si el domiciliario compra) el valor aproximado. */
  readonly total = computed(() => (this.tarifa() ?? 0) + (this.pagaDomiciliario() ? this.valorPedido() ?? 0 : 0));

  /** Precio del domicilio (tarifa de domicilio en moto, la misma con la que se cobra). */
  async cotizar(): Promise<{ precio: number; km: number; min: number }> {
    const o = this.tienda()!;
    const d = this.entrega()!;
    const c = await this.api.get<{ distancia_km: number; duracion_min: number; opciones: { valor_estimado: number }[] }>(
      `/tarifas/cotizar?tipo_servicio=domicilio&tipo_vehiculo=moto` +
        `&origen_lat=${o.lat}&origen_lng=${o.lng}&destino_lat=${d.lat}&destino_lng=${d.lng}`,
    );
    const precio = Number(c.opciones[0]?.valor_estimado) || 0;
    this.tarifa.set(precio);
    return { precio, km: Number(c.distancia_km), min: Number(c.duracion_min) };
  }

  async pedir(): Promise<DomicilioCreado> {
    const o = this.tienda()!;
    const d = this.entrega()!;
    const compra = this.pagaDomiciliario();
    const s = await this.api.post<DomicilioCreado>('/servicios', {
      tipo: 'domicilio',
      tipo_vehiculo: 'moto',
      metodo_pago: 'efectivo',
      origen_lat: o.lat,
      origen_lng: o.lng,
      origen: o.detalle ?? o.nombre,
      origen_barrio: o.barrio,
      destino_lat: d.lat,
      destino_lng: d.lng,
      destino: d.detalle ? `${d.nombre}, ${d.detalle}` : d.nombre,
      destino_barrio: d.barrio,
      establecimiento: o.nombre === 'Mi ubicación' || o.nombre === 'Punto en el mapa' ? null : o.nombre,
      categoria: this.categoria(),
      descripcion: this.descripcion().trim(),
      requiere_compra: compra,
      valor_productos_aprox: compra ? this.valorPedido() : null,
    });
    this.pedido.set(s);
    return s;
  }

  detalle(id: number): Promise<DetalleDomicilio> {
    return this.api.get<DetalleDomicilio>(`/servicios/${id}`);
  }

  historial(id: number): Promise<PasoHistorial[]> {
    return this.api.get<PasoHistorial[]>(`/servicios/${id}/historial`);
  }

  cancelar(id: number): Promise<unknown> {
    return this.api.post(`/servicios/${id}/estado`, { estado: 'cancelado' });
  }

  calificar(id: number, puntuacion: number): Promise<unknown> {
    return this.api.post(`/servicios/${id}/calificar`, { puntuacion });
  }

  /** Después de pedir se limpia el pedido (la tienda y la entrega se quedan para el próximo). */
  olvidar(): void {
    this.descripcion.set('');
    this.categoria.set(null);
    this.pagaDomiciliario.set(false);
    this.valorPedido.set(null);
    this.tarifa.set(null);
  }
}

/** Nombre corto del pedido para las tarjetas: "Farmacia" o, sin categoría, "Domicilio". */
export function tituloPedido(categoria: Categoria | null | undefined): string {
  return CATEGORIAS.find((c) => c.id === categoria)?.nombre ?? 'Domicilio';
}

export function iconoPedido(categoria: Categoria | null | undefined): NombreIcono {
  return CATEGORIAS.find((c) => c.id === categoria)?.icono ?? 'domicilio';
}
