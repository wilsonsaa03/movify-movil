import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { NombreIcono } from '../componentes/icono/icono.component';
import { Lugar } from './lugares.service';
import { PagosService } from './pagos.service';

export type CategoriaComercio = 'comida' | 'farmacia' | 'mercado' | 'licores' | 'tienda';

export const CATEGORIAS_COMERCIO: { id: CategoriaComercio | null; nombre: string; icono: NombreIcono }[] = [
  { id: null, nombre: 'Todo', icono: 'domicilio' },
  { id: 'comida', nombre: 'Comida', icono: 'comida' },
  { id: 'farmacia', nombre: 'Farmacia', icono: 'farmacia' },
  { id: 'mercado', nombre: 'Mercado', icono: 'mercado' },
  { id: 'licores', nombre: 'Licores +18', icono: 'mercado' },
  { id: 'tienda', nombre: 'Tiendas', icono: 'domicilio' },
];

/** GET /api/domicilios/comercios */
export interface Comercio {
  id: number;
  nombre: string;
  categoria: CategoriaComercio;
  descripcion: string | null;
  foto_url: string | null;
  direccion: string;
  barrio: string | null;
  lat: number;
  lng: number;
  abre: string;
  cierra: string;
  pedido_minimo: number;
  abierto: boolean;
  distancia_km: number | null;
  minutos_min: number;
  minutos_max: number;
  tiene_mayores: boolean;
  productos: number;
}

export interface Opcion {
  id: number;
  nombre: string;
  precio_extra: number;
  disponible: boolean;
}

export interface GrupoOpciones {
  id: number;
  nombre: string;
  minimo: number;
  maximo: number;
  obligatorio: boolean;
  opciones: Opcion[];
}

export interface Producto {
  id: number;
  seccion: string;
  nombre: string;
  descripcion: string | null;
  foto_url: string | null;
  precio: number;
  disponible: boolean;
  solo_mayores: boolean;
  grupos: GrupoOpciones[];
}

/** GET /api/domicilios/comercios/{id} */
export interface ComercioDetalle extends Omit<Comercio, 'minutos_min' | 'minutos_max' | 'productos'> {
  minutos_preparacion: number;
  radio_km: number;
  entrega_aqui: boolean;
  secciones: { nombre: string; productos: Producto[] }[];
}

/** Una línea del carrito (se guarda en el celular). */
export interface LineaCarrito {
  /** producto + opciones + nota: dos líneas iguales se suman en una. */
  clave: string;
  producto_id: number;
  nombre: string;
  foto_url: string | null;
  solo_mayores: boolean;
  /** Precio del producto + sus opciones (lo que vio; el backend lo recalcula al cotizar y al pedir). */
  precio_unitario: number;
  cantidad: number;
  opciones: { id: number; nombre: string; precio_extra: number }[];
  nota: string | null;
}

export interface Carrito {
  comercio: { id: number; nombre: string; categoria: CategoriaComercio; pedido_minimo: number; foto_url: string | null };
  lineas: LineaCarrito[];
}

/** POST /api/domicilios/cotizar: el carrito calculado por el backend. */
export interface Cotizacion {
  comercio: { id: number; nombre: string; abierto: boolean; pedido_minimo: number };
  lineas: {
    producto_id: number;
    nombre: string;
    cantidad: number;
    opciones: { grupo: string; nombre: string; precio_extra: number }[];
    nota: string | null;
    precio_unitario: number;
    total_linea: number;
    problemas: string[];
  }[];
  subtotal: number;
  domicilio: number;
  descuento: number;
  cupon: { codigo: string; valido: boolean; mensaje: string; descuento: number } | null;
  total: number;
  minutos_min: number;
  minutos_max: number;
  solo_mayores: boolean;
  mayor_edad_confirmado: boolean;
  errores: string[];
  puede_pedir: boolean;
}

export interface PedidoCreado {
  id: number;
  subtotal: number;
  descuento: number;
  total: number;
}

const CLAVE = 'movify.carrito.domicilio';

/**
 * Domicilios con catálogo (comercios aliados, estilo Rappi): consulta del catálogo y el CARRITO.
 * Reglas: un carrito = un comercio (si agrega de otro, se pregunta si vaciarlo); el carrito se guarda en el celular
 * y el backend recalcula precios, opciones, cupón y domicilio al cotizar y al pedir (nunca se confía en la app).
 */
@Injectable({ providedIn: 'root' })
export class CatalogoDomicilioService {
  private readonly api = inject(ApiService);
  private readonly pagos = inject(PagosService);

  readonly carrito = signal<Carrito | null>(CatalogoDomicilioService.leer());
  /** Dirección de entrega (la misma idea de "ENTREGAR EN" del pedido libre). */
  readonly entrega = signal<Lugar | null>(null);
  readonly cupon = signal('');
  readonly instrucciones = signal('');

  readonly unidades = computed(() => this.carrito()?.lineas.reduce((n, l) => n + l.cantidad, 0) ?? 0);
  /** Lo que la app calcula para mostrar rápido (el valor oficial es el de cotizar). */
  readonly subtotal = computed(() => this.carrito()?.lineas.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0) ?? 0);
  readonly tieneMayores = computed(() => this.carrito()?.lineas.some((l) => l.solo_mayores) || this.carrito()?.comercio.categoria === 'licores');

  // ───────────── Catálogo ─────────────

  comercios(f: { categoria?: CategoriaComercio | null; q?: string; lat?: number | null; lng?: number | null }): Promise<Comercio[]> {
    const p = new URLSearchParams();
    if (f.categoria) p.set('categoria', f.categoria);
    if (f.q?.trim()) p.set('q', f.q.trim());
    if (f.lat != null && f.lng != null) {
      p.set('lat', String(f.lat));
      p.set('lng', String(f.lng));
    }
    const qs = p.toString();
    return this.api.get<Comercio[]>(`/domicilios/comercios${qs ? '?' + qs : ''}`);
  }

  comercio(id: number, lat?: number | null, lng?: number | null): Promise<ComercioDetalle> {
    const qs = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '';
    return this.api.get<ComercioDetalle>(`/domicilios/comercios/${id}${qs}`);
  }

  // ───────────── Carrito ─────────────

  /** ¿Agregar este producto obliga a vaciar el carrito (es de otro comercio)? */
  esDeOtroComercio(comercioId: number): boolean {
    const c = this.carrito();
    return !!c && c.lineas.length > 0 && c.comercio.id !== comercioId;
  }

  agregar(comercio: Carrito['comercio'], linea: Omit<LineaCarrito, 'clave'>): void {
    const clave = `${linea.producto_id}|${linea.opciones.map((o) => o.id).sort((a, b) => a - b).join(',')}|${(linea.nota ?? '').trim()}`;
    const actual = this.carrito();
    const base: Carrito = actual && actual.comercio.id === comercio.id ? actual : { comercio, lineas: [] };
    const existe = base.lineas.find((l) => l.clave === clave);
    const lineas = existe
      ? base.lineas.map((l) => (l.clave === clave ? { ...l, cantidad: Math.min(20, l.cantidad + linea.cantidad) } : l))
      : [...base.lineas, { ...linea, clave }];
    this.guardar({ comercio, lineas });
  }

  cambiarCantidad(clave: string, cantidad: number): void {
    const c = this.carrito();
    if (!c) return;
    const lineas = cantidad <= 0 ? c.lineas.filter((l) => l.clave !== clave) : c.lineas.map((l) => (l.clave === clave ? { ...l, cantidad: Math.min(20, cantidad) } : l));
    this.guardar(lineas.length ? { ...c, lineas } : null);
  }

  vaciar(): void {
    this.guardar(null);
    this.cupon.set('');
  }

  // ───────────── Cotizar y pedir ─────────────

  private cuerpo(extra: Record<string, unknown> = {}): Record<string, unknown> {
    const c = this.carrito()!;
    const d = this.entrega()!;
    return {
      comercio_id: c.comercio.id,
      lineas: c.lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, opciones: l.opciones.map((o) => o.id), nota: l.nota })),
      destino_lat: d.lat,
      destino_lng: d.lng,
      destino: d.detalle ? `${d.nombre}, ${d.detalle}` : d.nombre,
      destino_barrio: d.barrio,
      instrucciones: this.instrucciones().trim() || null,
      cupon: this.cupon().trim() || null,
      metodo_pago: this.pagos.preferida(),
      ...extra,
    };
  }

  cotizar(): Promise<Cotizacion> {
    return this.api.post<Cotizacion>('/domicilios/cotizar', this.cuerpo());
  }

  async pedir(subtotalVisto: number, confirmaMayorEdad: boolean): Promise<PedidoCreado> {
    const r = await this.api.post<PedidoCreado>(
      '/domicilios/pedir',
      this.cuerpo({ subtotal_visto: subtotalVisto, confirma_mayor_edad: confirmaMayorEdad || null }),
    );
    this.vaciar();
    this.instrucciones.set('');
    return r;
  }

  private guardar(c: Carrito | null): void {
    this.carrito.set(c);
    try {
      if (c) localStorage.setItem(CLAVE, JSON.stringify(c));
      else localStorage.removeItem(CLAVE);
    } catch {
      /* sin almacenamiento: el carrito dura mientras la app esté abierta */
    }
  }

  private static leer(): Carrito | null {
    try {
      const t = localStorage.getItem(CLAVE);
      const c = t ? (JSON.parse(t) as Carrito) : null;
      return c?.comercio && Array.isArray(c.lineas) && c.lineas.length ? c : null;
    } catch {
      return null;
    }
  }
}

/** "Abre a las 6:00 p. m." a partir de "18:00". */
export function horaBonita(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
}
