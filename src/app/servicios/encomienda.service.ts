import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { SesionService } from '../core/sesion.service';
import { Lugar } from './lugares.service';
import { TipoVehiculo } from './viaje.service';

/** Tamaños del Figma (Encomienda 2 · Paquete). El mediano no cabe en la moto: va en taxi. */
export type Tamano = 'sobre' | 'pequeno' | 'mediano';

export interface OpcionTamano {
  id: Tamano;
  nombre: string;
  detalle: string;
  vehiculo: TipoVehiculo;
}

export const TAMANOS: OpcionTamano[] = [
  { id: 'sobre', nombre: 'Sobre', detalle: 'Documentos o cartas', vehiculo: 'moto' },
  { id: 'pequeno', nombre: 'Pequeño', detalle: 'Cabe en una mochila', vehiculo: 'moto' },
  { id: 'mediano', nombre: 'Mediano', detalle: 'Cabe en el baúl de un carro', vehiculo: 'taxi' },
];

/** Lo que no se lleva (se muestra en "Ver la lista"). */
export const PROHIBIDOS = [
  'Dinero en efectivo, joyas o títulos valores',
  'Armas, municiones o explosivos',
  'Animales vivos',
  'Drogas o sustancias prohibidas',
  'Líquidos inflamables o productos peligrosos',
];

/** POST /api/servicios con tipo "encomienda". */
export interface EncomiendaCreada {
  id: number;
  tarifa: number;
  conductores_notificados: number;
  expira_busqueda_en: string;
  codigo_entrega: string;
}

/** GET /api/servicios/{id} (lo que usan Seguimiento y Entregada). */
export interface DetalleEnvio {
  id: number;
  tipo_servicio: string;
  tipo_vehiculo: TipoVehiculo;
  estado_codigo: 'buscando' | 'asignado' | 'en_origen' | 'en_curso' | 'finalizado' | 'cancelado' | 'expirado';
  origen: string;
  origen_barrio: string | null;
  destino: string;
  destino_barrio: string | null;
  origen_lat: number;
  origen_lng: number;
  destino_lat: number;
  destino_lng: number;
  tarifa: number;
  codigo_entrega: string | null;
  conductor_nombre: string | null;
  conductor_telefono: string | null;
  conductor_calificacion: number | null;
  conductor_placa: string | null;
  conductor_modelo: string | null;
  conductor_color: string | null;
  conductor_lat: number | null;
  conductor_lng: number | null;
}

/** GET /api/servicios/{id}/encomienda */
export interface DatosPaquete {
  remitente_nombre: string;
  destinatario_nombre: string;
  destinatario_telefono?: string;
  descripcion_paquete: string;
  tamano: 'pequeno' | 'mediano' | 'grande';
  fragil: boolean;
  entregado_a: string | null;
  paga_destinatario: boolean;
}

/** GET /api/servicios/{id}/historial */
export interface PasoHistorial {
  creado_en: string;
  estado_nuevo: string;
}

/**
 * La encomienda que el cliente está armando (Encomienda 1 → 2 → 3) y las llamadas para pedirla y seguirla.
 * El borrador vive en memoria; una vez pedida, las pantallas trabajan con el id del servicio.
 */
@Injectable({ providedIn: 'root' })
export class EncomiendaService {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);

  // Encomienda 1 · Destino
  readonly origen = signal<Lugar | null>(null);
  readonly destino = signal<Lugar | null>(null);
  readonly recibeYo = signal(false);
  readonly nombreRecibe = signal('');
  readonly celularRecibe = signal('');

  // Encomienda 2 · Paquete
  readonly tamano = signal<Tamano>('pequeno');
  readonly contenido = signal('');
  readonly fragil = signal(false);

  // Encomienda 3 · Confirmar
  readonly pagaDestinatario = signal(false);
  readonly precio = signal<number | null>(null);
  readonly pedido = signal<EncomiendaCreada | null>(null);

  readonly opcionTamano = computed(() => TAMANOS.find((t) => t.id === this.tamano())!);
  readonly vehiculo = computed<TipoVehiculo>(() => this.opcionTamano().vehiculo);
  /** Primer nombre de quien recibe ("Luisa"), para los textos. */
  readonly primerNombre = computed(() => (this.recibeYo() ? 'ti' : this.nombreRecibe().trim().split(/\s+/)[0] || 'quien recibe'));

  /** Nombre y celular de la cuenta (para "Lo recibo yo mismo"). */
  miNombre(): string {
    return this.sesion.datos()?.nombre ?? '';
  }

  miCelular(): string {
    return (this.sesion.datos()?.telefono ?? '').replace(/^\+57/, '');
  }

  /** Precio fijo de la tarifa de encomienda para el vehículo que exige el tamaño. */
  async cotizar(): Promise<{ precio: number; km: number; min: number }> {
    const o = this.origen()!;
    const d = this.destino()!;
    const c = await this.api.get<{ distancia_km: number; duracion_min: number; opciones: { valor_estimado: number }[] }>(
      `/tarifas/cotizar?tipo_servicio=encomienda&tipo_vehiculo=${this.vehiculo()}` +
        `&origen_lat=${o.lat}&origen_lng=${o.lng}&destino_lat=${d.lat}&destino_lng=${d.lng}`,
    );
    const precio = Number(c.opciones[0]?.valor_estimado) || 0;
    this.precio.set(precio);
    return { precio, km: Number(c.distancia_km), min: Number(c.duracion_min) };
  }

  async pedir(): Promise<EncomiendaCreada> {
    const o = this.origen()!;
    const d = this.destino()!;
    const t = this.opcionTamano();
    const s = await this.api.post<EncomiendaCreada>('/servicios', {
      tipo: 'encomienda',
      tipo_vehiculo: t.vehiculo,
      metodo_pago: 'efectivo',
      origen_lat: o.lat,
      origen_lng: o.lng,
      origen: o.detalle ?? o.nombre,
      origen_barrio: o.barrio,
      destino_lat: d.lat,
      destino_lng: d.lng,
      destino: d.detalle ? `${d.nombre}, ${d.detalle}` : d.nombre,
      destino_barrio: d.barrio,
      descripcion: this.contenido().trim(),
      nombre_remitente: this.miNombre(),
      nombre_destinatario: this.recibeYo() ? this.miNombre() : this.nombreRecibe().trim(),
      telefono_destinatario: this.recibeYo() ? this.miCelular() : this.celularRecibe(),
      tipo_paquete: t.id,
      fragil: this.fragil(),
      paga_destinatario: this.pagaDestinatario(),
    });
    this.pedido.set(s);
    return s;
  }

  detalle(id: number): Promise<DetalleEnvio> {
    return this.api.get<DetalleEnvio>(`/servicios/${id}`);
  }

  paquete(id: number): Promise<DatosPaquete> {
    return this.api.get<DatosPaquete>(`/servicios/${id}/encomienda`);
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

  /** Después de pedir se limpia lo que se estaba armando (quién recibe y el paquete). */
  olvidar(): void {
    this.destino.set(null);
    this.recibeYo.set(false);
    this.nombreRecibe.set('');
    this.celularRecibe.set('');
    this.contenido.set('');
    this.fragil.set(false);
    this.pagaDestinatario.set(false);
    this.precio.set(null);
  }
}

/** Celular colombiano de 10 dígitos que empieza por 3 (o fijo 60x), con o sin espacios. Igual que el backend. */
export function celularValido(c: string): boolean {
  return /^(3\d{9}|60\d{8})$/.test(c.replace(/\D/g, ''));
}

/** "Pequeño · Frágil" */
export function nombrePaquete(tamano: string, fragil: boolean): string {
  const t = tamano === 'mediano' ? 'Mediano' : tamano === 'grande' ? 'Grande' : 'Pequeño';
  return fragil ? `${t} · Frágil` : t;
}

/** "4:19 p. m." */
export function hora(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
}
