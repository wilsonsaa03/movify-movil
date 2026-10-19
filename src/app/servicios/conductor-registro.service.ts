import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';

export type TipoVehiculo = 'moto' | 'taxi';
export type PasoConductor =
  | 'identidad'
  | 'licencia'
  | 'vehiculo'
  | 'documentos'
  | 'enviar'
  | 'revision'
  | 'corregir'
  | 'suspendido'
  | 'aprobado';
export type PasoDocumento = 'identidad' | 'licencia' | 'vehiculo' | 'documentos';
export type EstadoDocumento = 'pendiente' | 'aprobado' | 'rechazado';

export interface TipoDocumento {
  codigo: string;
  nombre: string;
  aplica_a: 'conductor' | 'vehiculo';
  requiere_vencimiento: boolean;
  paso: PasoDocumento;
  orden: number;
  solo_imagen: boolean;
  ayuda: string | null;
}

export interface DocumentoSubido {
  id: number;
  tipo_documento: string;
  nombre: string;
  estado: EstadoDocumento;
  estado_nombre: string;
  observacion: string | null;
  fecha_vencimiento: string | null;
  mime_type: string;
  creado_en: string;
}

export interface Vehiculo {
  id: number;
  tipo_vehiculo: TipoVehiculo;
  placa: string;
  marca: string;
  linea: string | null;
  modelo_anio: number;
  color: string;
  empresa_afiliadora: string | null;
  numero_interno: string | null;
  cilindraje_cc: number | null;
  casco_pasajero: boolean | null;
}

export interface DatosConductor {
  tipo_identificacion: 'CC' | 'CE' | 'PPT';
  numero_identificacion: string;
  fecha_nacimiento: string;
  categorias: string[];
  numero_licencia: string | null;
  estado: string;
  motivo_estado: string | null;
  solicitud_enviada_en: string | null;
}

/** Respuesta de GET /api/conductor/registro */
export interface ProgresoConductor {
  siguiente: PasoConductor;
  tiene_perfil: boolean;
  conductor: DatosConductor | null;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido' | null;
  motivo_estado: string | null;
  /** Cuándo lo rechazó (o suspendió) el admin por última vez. */
  rechazado_en: string | null;
  /** Si lo rechazaron: ya cambió algo desde entonces y puede volver a enviar la solicitud. */
  corregido: boolean;
  tipo_vehiculo: TipoVehiculo | null;
  vehiculo: Vehiculo | null;
  documentos: DocumentoSubido[];
  faltantes: TipoDocumento[];
  requeridos: TipoDocumento[];
}

export interface DatosIdentidad {
  tipoIdentificacion: 'CC' | 'CE' | 'PPT';
  numeroIdentificacion: string;
  fechaNacimiento: string; // yyyy-MM-dd
}

export interface DatosLicencia {
  categoriasLicencia: string[];
  numeroLicencia: string;
}

export interface DatosVehiculo {
  tipoVehiculo: TipoVehiculo;
  placa: string;
  marca: string;
  linea: string;
  modeloAnio: number;
  color: string;
  empresaAfiliadora: string;
  numeroInterno: string;
  cilindrajeCc: number | null;
  cascoPasajero: boolean;
}

/** Fila de la pantalla de documentos: lo que se pide + lo que ya subió (si algo). */
export interface FilaDocumento {
  tipo: TipoDocumento;
  subido: DocumentoSubido | null;
  estado: 'falta' | EstadoDocumento;
}

/** Ruta de la app para cada paso del registro. */
export const RUTA_PASO: Record<PasoConductor, string> = {
  identidad: '/conductor/identidad',
  licencia: '/conductor/licencia',
  vehiculo: '/conductor/vehiculo',
  documentos: '/conductor/documentos',
  enviar: '/conductor/revisar',
  revision: '/conductor/enviada',
  // Rechazado o suspendido: primero la pantalla que explica el motivo (antes "corregir" abría el formulario
  // directo y el conductor reenviaba sin ver por qué lo rechazaron)
  corregir: '/conductor/enviada',
  suspendido: '/conductor/enviada',
  aprobado: '/conductor/enviada',
};

/**
 * Registro del conductor (moto o taxi) contra el backend:
 *
 *   GET  /conductor/registro        → en qué paso va y qué documentos/fotos le faltan
 *   POST /conductor/identidad       → paso 1 (crea el perfil "pendiente"; el rol conductor llega al aprobarlo)
 *   POST /conductor/licencia        → paso 2
 *   POST /conductor/vehiculos       → paso 3 (moto o taxi)
 *   POST /conductor/documentos      → una foto o PDF por documento (multipart, con avance)
 *   POST /conductor/solicitud       → paso 5 "Enviar solicitud"
 */
@Injectable({ providedIn: 'root' })
export class ConductorRegistroService {
  private readonly api = inject(ApiService);

  /** Lo que eligió en la primera pantalla (antes de registrar el vehículo). */
  readonly tipoElegido = signal<TipoVehiculo | null>(this.leerTipo());
  readonly progreso = signal<ProgresoConductor | null>(null);

  readonly tipo = computed<TipoVehiculo | null>(() => this.progreso()?.tipo_vehiculo ?? this.tipoElegido());

  /** Todos los documentos y fotos que se piden, con lo que ya subió. */
  readonly filas = computed<FilaDocumento[]>(() => {
    const p = this.progreso();
    if (!p) return [];
    return p.requeridos.map((tipo) => {
      const subido = p.documentos.find((d) => d.tipo_documento === tipo.codigo) ?? null;
      return { tipo, subido, estado: subido ? subido.estado : 'falta' };
    });
  });

  filasDe(paso: PasoDocumento): FilaDocumento[] {
    return this.filas().filter((f) => f.tipo.paso === paso);
  }

  fila(codigo: string): FilaDocumento | null {
    return this.filas().find((f) => f.tipo.codigo === codigo) ?? null;
  }

  /** ¿Ya subió todo lo de este paso (y nada está rechazado)? */
  pasoListo(paso: PasoDocumento): boolean {
    const filas = this.filasDe(paso);
    return filas.length > 0 && filas.every((f) => f.estado === 'pendiente' || f.estado === 'aprobado');
  }

  readonly conductor = computed(() => this.progreso()?.conductor ?? null);
  readonly vehiculo = computed(() => this.progreso()?.vehiculo ?? null);

  elegirTipo(t: TipoVehiculo): void {
    this.tipoElegido.set(t);
    try {
      localStorage.setItem('movify.conductor.tipo', t);
    } catch {
      /* sin almacenamiento */
    }
  }

  async cargar(): Promise<ProgresoConductor> {
    const t = this.tipoElegido();
    const p = await this.api.get<ProgresoConductor>('/conductor/registro' + (t ? `?tipo=${t}` : ''));
    this.progreso.set(p);
    if (p.tipo_vehiculo) this.elegirTipo(p.tipo_vehiculo);
    return p;
  }

  async guardarIdentidad(d: DatosIdentidad): Promise<void> {
    const r = await this.api.post<{ requiereNuevoToken?: boolean }>('/conductor/identidad', d);
    // Hoy el backend responde false (el rol "conductor" llega cuando el admin aprueba); se deja por si cambia
    if (r.requiereNuevoToken) await this.api.renovarSesion();
    await this.cargar();
  }

  async guardarLicencia(d: DatosLicencia): Promise<void> {
    await this.api.post('/conductor/licencia', d);
    await this.cargar();
  }

  async registrarVehiculo(d: DatosVehiculo): Promise<void> {
    await this.api.post('/conductor/vehiculos', {
      ...d,
      placa: d.placa.replace(/[\s-]/g, '').toUpperCase(),
      linea: d.linea || null,
      empresaAfiliadora: d.empresaAfiliadora || null,
      numeroInterno: d.numeroInterno || null,
      cilindrajeCc: d.tipoVehiculo === 'moto' ? d.cilindrajeCc : null,
      cascoPasajero: d.tipoVehiculo === 'moto' ? d.cascoPasajero : null,
    });
    this.elegirTipo(d.tipoVehiculo);
    await this.cargar();
  }

  /** Avance de cada subida en curso (0 a 1), por código de documento. */
  readonly avance = signal<Record<string, number>>({});
  /** Miniatura de lo que subió en esta sesión (para no volver a descargarlo). */
  readonly vistas = signal<Record<string, string>>({});

  subiendo(codigo: string): number | null {
    return this.avance()[codigo] ?? null;
  }

  /**
   * Sube una foto o PDF de un documento: la reduce, muestra la miniatura de una vez,
   * informa el avance y al final recarga el progreso. Lanza ErrorApi si el backend la rechaza.
   */
  async subir(codigo: string, archivo: File, vence: string | null = null): Promise<void> {
    const listo = await prepararArchivo(archivo);
    if (listo.vistaPrevia) this.vistas.update((v) => ({ ...v, [codigo]: listo.vistaPrevia! }));
    const marcar = (f: number) => this.avance.update((a) => ({ ...a, [codigo]: f }));
    marcar(0);
    try {
      const form = new FormData();
      form.append('tipo', codigo);
      form.append('archivo', listo.blob, listo.nombre);
      if (vence) form.append('fechaVencimiento', vence);
      await this.api.subir('/conductor/documentos', form, marcar);
      await this.cargar();
    } catch (e) {
      this.vistas.update((v) => {
        const { [codigo]: _, ...resto } = v;
        return resto;
      });
      throw e;
    } finally {
      this.avance.update((a) => {
        const { [codigo]: _, ...resto } = a;
        return resto;
      });
    }
  }

  verDocumento(id: number): Promise<Blob> {
    return this.api.blob(`/conductor/mis-documentos/${id}/archivo`);
  }

  async enviarSolicitud(): Promise<void> {
    await this.api.post('/conductor/solicitud', { aceptaCondiciones: true });
    await this.cargar();
  }

  /** Ruta de la pantalla del paso en el que va (se usa al terminar cada pantalla). */
  rutaSiguiente(): string {
    const p = this.progreso();
    return p ? RUTA_PASO[p.siguiente] : '/conductor';
  }

  private leerTipo(): TipoVehiculo | null {
    try {
      const t = localStorage.getItem('movify.conductor.tipo');
      return t === 'moto' || t === 'taxi' ? t : null;
    } catch {
      return null;
    }
  }
}

// ───────────── Utilidades de formulario ─────────────

/** Placas en Colombia: taxi ABC123 · moto ABC12D. */
export function placaValida(tipo: TipoVehiculo, placa: string): boolean {
  const p = placa.replace(/[\s-]/g, '').toUpperCase();
  return tipo === 'taxi' ? /^[A-Z]{3}\d{3}$/.test(p) : /^[A-Z]{3}\d{2}[A-Z]$/.test(p);
}

/** "abc12d" → "ABC 12D" · "abc123" → "ABC 123" (como se ve en la placa física). */
export function formatearPlaca(valor: string): string {
  const p = valor.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  return p.length > 3 ? `${p.slice(0, 3)} ${p.slice(3)}` : p;
}

/** Categorías de licencia válidas para cada vehículo (Código Nacional de Tránsito). */
export const CATEGORIAS: Record<TipoVehiculo, { codigo: string; texto: string }[]> = {
  moto: [
    { codigo: 'A1', texto: 'Motos hasta 125 cc' },
    { codigo: 'A2', texto: 'Motos de más de 125 cc' },
  ],
  taxi: [
    { codigo: 'C1', texto: 'Taxi · automóvil público' },
    { codigo: 'C2', texto: 'Camionetas públicas' },
  ],
};

/**
 * Reduce una foto antes de subirla (máx. 1600 px, JPEG 82 %): una foto de celular de 4 MB
 * queda en ~300 KB, que sube rápido aunque la señal esté floja. Los PDF se suben tal cual.
 */
export async function prepararArchivo(archivo: File): Promise<{ blob: Blob; nombre: string; vistaPrevia: string | null }> {
  if (!archivo.type.startsWith('image/')) {
    return { blob: archivo, nombre: archivo.name, vistaPrevia: null };
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = mal;
      i.src = url;
    });
    const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b ?? archivo), 'image/jpeg', 0.82));
    return { blob, nombre: archivo.name.replace(/\.\w+$/, '') + '.jpg', vistaPrevia: canvas.toDataURL('image/jpeg', 0.6) };
  } catch {
    return { blob: archivo, nombre: archivo.name, vistaPrevia: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}
