import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';

export type MetodoPago = 'efectivo' | 'nequi' | 'daviplata' | 'tarjeta' | 'pse' | 'bancolombia';
export type MetodoDigital = Exclude<MetodoPago, 'efectivo'>;
export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'error' | 'cancelado';

/** GET /api/catalogos/formas-pago */
export interface FormasPago {
  metodos: MetodoPago[];
  /** apagado | simulado | wompi */
  modo: string;
  de_prueba: boolean;
  /** Solo en modo de prueba: los datos del sandbox de Wompi. */
  pruebas?: {
    nequi_aprueba: string;
    nequi_rechaza: string;
    daviplata_codigo: string;
    tarjeta_aprueba: string;
    tarjeta_rechaza: string;
    pse_banco_aprueba: string;
    pse_banco_rechaza: string;
  };
  /** Solo con Wompi: para crear el token de la tarjeta directo con Wompi (la llave pública es pública por diseño). */
  wompi?: { url: string; llave_publica: string };
}

export interface BancoPse {
  codigo: string;
  nombre: string;
}

/** Datos de la tarjeta: van directo a Wompi para sacar el token; nunca se mandan a MoviFY. */
export interface DatosTarjeta {
  numero: string;
  mes: string;
  anio: string;
  cvc: string;
  titular: string;
}

/** Lo que se manda al pagar (cada medio usa lo suyo). */
export interface PedidoPago {
  metodo: MetodoDigital;
  cuenta?: string;
  cuotas?: string;
  ultimos4?: string;
  tipo_persona?: 'natural' | 'juridica';
  tipo_documento?: 'CC' | 'NIT';
  banco?: string;
}

export interface Pago {
  id: number;
  metodo: MetodoDigital;
  proveedor: string;
  estado: EstadoPago;
  monto: number;
  detalle: string | null;
  cuenta_mascara: string | null;
  requiere_otp: boolean;
  actualizado_en: string;
  /** PSE y Bancolombia: la página del banco donde se termina el pago. */
  url_pago: string | null;
}

/** GET /api/servicios/{id}/pago */
export interface EstadoPagoServicio {
  servicio_id: number;
  metodo_pago: MetodoPago;
  monto: number;
  modo: string;
  de_prueba: boolean;
  terminos_url: string | null;
  pago: Pago | null;
  puede_pagar: boolean;
  pruebas?: FormasPago['pruebas'];
}

const PREFERIDA = 'movify.pago.preferido';

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  tarjeta: 'Tarjeta',
  pse: 'PSE',
  bancolombia: 'Bancolombia',
};

const DIGITALES: MetodoDigital[] = ['nequi', 'daviplata', 'tarjeta', 'pse', 'bancolombia'];

export function esDigital(m: string | null | undefined): m is MetodoDigital {
  return DIGITALES.includes(m as MetodoDigital);
}

/**
 * Pagos con Nequi y Daviplata (Wompi sandbox o el simulador del backend). El efectivo sigue siendo el respaldo:
 * si el pago digital no se aprueba, se le paga al conductor.
 */
@Injectable({ providedIn: 'root' })
export class PagosService {
  private readonly api = inject(ApiService);
  private catalogo: Promise<FormasPago> | null = null;
  /** La última forma de pago que eligió (se guarda en el celular). */
  readonly preferida = signal<MetodoPago>(PagosService.leerPreferida());

  formas(): Promise<FormasPago> {
    this.catalogo ??= this.api.get<FormasPago>('/catalogos/formas-pago').catch(() => {
      this.catalogo = null;
      return { metodos: ['efectivo'], modo: 'apagado', de_prueba: false } as FormasPago;
    });
    return this.catalogo;
  }

  elegir(m: MetodoPago): void {
    this.preferida.set(m);
    try {
      localStorage.setItem(PREFERIDA, m);
    } catch {
      /* sin almacenamiento: solo dura mientras la app está abierta */
    }
  }

  estado(servicioId: number): Promise<EstadoPagoServicio> {
    return this.api.get(`/servicios/${servicioId}/pago`);
  }

  pagar(servicioId: number, pedido: PedidoPago): Promise<EstadoPagoServicio> {
    return this.api.post(`/servicios/${servicioId}/pago`, pedido);
  }

  bancosPse(): Promise<BancoPse[]> {
    return this.api.get<BancoPse[]>('/catalogos/bancos-pse');
  }

  /**
   * Token de la tarjeta. Con Wompi: POST {url}/tokens/cards con la llave pública, directo desde el celular (el número
   * nunca pasa por MoviFY). En modo simulado: un token de prueba con el resultado de la tarjeta del sandbox.
   */
  async tokenTarjeta(t: DatosTarjeta): Promise<string> {
    const numero = t.numero.replace(/\D/g, '');
    const f = await this.formas();
    if (f.modo === 'simulado') {
      // Simulador: la tarjeta de rechazo del sandbox rechaza; cualquier otra aprueba (para la demo)
      const r = numero === '4111111111111111' ? 'D' : 'A';
      return `sim_tok_${r}_${numero.slice(-4)}`;
    }
    if (!f.wompi) throw new Error('Los pagos con tarjeta no están disponibles.');
    const res = await fetch(`${f.wompi.url}/tokens/cards`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${f.wompi.llave_publica}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numero, cvc: t.cvc, exp_month: t.mes.padStart(2, '0'), exp_year: t.anio.slice(-2), card_holder: t.titular }),
    });
    const j = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
    if (!res.ok || !j?.data?.id) throw new Error('La tarjeta no es válida. Revisa el número, la fecha y el código.');
    return j.data.id;
  }

  codigo(servicioId: number, codigo: string): Promise<EstadoPagoServicio> {
    return this.api.post(`/servicios/${servicioId}/pago/otp`, { codigo });
  }

  enEfectivo(servicioId: number): Promise<EstadoPagoServicio> {
    return this.api.post(`/servicios/${servicioId}/pago/cancelar`, {});
  }

  private static leerPreferida(): MetodoPago {
    try {
      const m = localStorage.getItem(PREFERIDA);
      return esDigital(m) ? m : 'efectivo';
    } catch {
      return 'efectivo';
    }
  }
}
