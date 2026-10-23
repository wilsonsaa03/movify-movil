import { Injectable, signal } from '@angular/core';

export interface MiUbicacion {
  lat: number;
  lng: number;
  /** Radio de error del GPS en metros (en el PC, por Wi-Fi/IP, puede ser de cientos de metros). */
  precision: number | null;
  barrio: string | null; // "La Playita"
  direccion: string | null; // "Cra 3 #5-20"
  ciudad: string | null; // "Buenaventura"
}

export type EstadoUbicacion = 'buscando' | 'lista' | 'sin-permiso' | 'error';

/** Respuesta de Nominatim /reverse (solo lo que se usa). */
interface RespuestaNominatim {
  address?: Record<string, string | undefined>;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const CLAVE = 'movify.ubicacion';
/** El barrio/dirección se vuelve a consultar solo si se movió más que esto (Nominatim pide no abusar: 1 consulta/s). */
const MISMO_SITIO_M = 80;
const ENTRE_CONSULTAS_MS = 1500;

/**
 * Dónde está el usuario, en tiempo real: GPS del celular (watchPosition) + barrio y dirección
 * (geocodificación inversa con OpenStreetMap/Nominatim).
 *
 *  - `seguir()` / `dejarDeSeguir()`: la pantalla que muestra el mapa lo prende al entrar y lo apaga al salir
 *    (el GPS gasta batería). Cada posición nueva actualiza `ubicacion` al instante.
 *  - `actualizar()`: una sola lectura (para cuando se necesita la posición en un momento puntual).
 *
 * El backend todavía no tiene un servicio de direcciones; cuando lo tenga, solo cambia `buscarDireccion()`.
 */
@Injectable({ providedIn: 'root' })
export class UbicacionService {
  readonly ubicacion = signal<MiUbicacion | null>(this.leerGuardada());
  readonly estado = signal<EstadoUbicacion>(this.ubicacion() ? 'lista' : 'buscando');

  private vigilancia: number | null = null;
  private seguidores = 0;
  /** Punto donde se consultó el barrio por última vez. */
  private geocodificado: { lat: number; lng: number } | null = this.ubicacion()?.barrio ? this.ubicacion() : null;
  private consultando: Promise<void> | null = null;
  private ultimaConsulta = 0;

  /** Empieza a seguir la posición en tiempo real. Se puede llamar desde varias pantallas (cuenta cuántas). */
  seguir(): void {
    this.seguidores++;
    if (this.vigilancia !== null || !('geolocation' in navigator)) {
      if (!('geolocation' in navigator)) this.estado.set('error');
      return;
    }
    if (!this.ubicacion()) this.estado.set('buscando');
    this.vigilancia = navigator.geolocation.watchPosition(
      (p) => this.aplicar(p),
      (e) => this.fallo(e),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  /** Deja de seguir cuando ya ninguna pantalla lo necesita. */
  dejarDeSeguir(): void {
    this.seguidores = Math.max(0, this.seguidores - 1);
    if (this.seguidores === 0 && this.vigilancia !== null) {
      navigator.geolocation.clearWatch(this.vigilancia);
      this.vigilancia = null;
    }
  }

  /** Una lectura puntual (espera también el barrio si hace falta consultarlo). */
  async actualizar(): Promise<void> {
    if (!('geolocation' in navigator)) {
      this.estado.set('error');
      return;
    }
    try {
      const p = await new Promise<GeolocationPosition>((ok, falla) =>
        navigator.geolocation.getCurrentPosition(ok, falla, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }),
      );
      await this.aplicar(p);
    } catch (e) {
      this.fallo(e as GeolocationPositionError);
    }
  }

  /** Mueve el punto de una vez y, si se desplazó lo suficiente, busca el barrio y la dirección nuevos. */
  private aplicar(p: GeolocationPosition): Promise<void> {
    const { latitude: lat, longitude: lng, accuracy } = p.coords;
    const previa = this.ubicacion();
    this.guardar({
      lat,
      lng,
      precision: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
      barrio: previa?.barrio ?? null,
      direccion: previa?.direccion ?? null,
      ciudad: previa?.ciudad ?? null,
    });
    this.estado.set('lista');

    const lejos = !this.geocodificado || this.metros(this.geocodificado, { lat, lng }) >= MISMO_SITIO_M;
    if (!lejos || this.consultando || Date.now() - this.ultimaConsulta < ENTRE_CONSULTAS_MS) {
      return this.consultando ?? Promise.resolve();
    }
    this.consultando = this.geocodificar(lat, lng).finally(() => (this.consultando = null));
    return this.consultando;
  }

  private async geocodificar(lat: number, lng: number): Promise<void> {
    this.ultimaConsulta = Date.now();
    try {
      const dir = await this.buscarDireccion(lat, lng);
      const actual = this.ubicacion();
      // Se guarda sobre la posición más reciente (pudo moverse mientras respondía Nominatim)
      if (actual) this.guardar({ ...actual, ...dir });
      this.geocodificado = { lat, lng };
    } catch {
      /* sin internet o Nominatim no respondió: se reintenta con la próxima posición */
    }
  }

  private fallo(e: GeolocationPositionError): void {
    if (this.ubicacion()) return; // ya hay una posición: se sigue mostrando
    this.estado.set(e?.code === 1 ? 'sin-permiso' : 'error');
  }

  /** Barrio y dirección de un punto cualquiera (también lo usa el selector de punto en el mapa). */
  async buscarDireccion(lat: number, lng: number): Promise<Pick<MiUbicacion, 'barrio' | 'direccion' | 'ciudad'>> {
    const url = `${NOMINATIM}?format=jsonv2&addressdetails=1&zoom=18&accept-language=es&lat=${lat}&lon=${lng}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error('Nominatim ' + resp.status);
    const a = ((await resp.json()) as RespuestaNominatim).address ?? {};

    const barrio = a['neighbourhood'] ?? a['suburb'] ?? a['quarter'] ?? a['residential'] ?? a['city_district'] ?? a['hamlet'] ?? null;
    const via = a['road'] ? UbicacionService.abreviarVia(a['road']) : null;
    const numero = a['house_number'] ? '#' + a['house_number'].replace(/^#\s*/, '') : '';
    return {
      barrio,
      direccion: via ? `${via} ${numero}`.trim() : null,
      ciudad: a['city'] ?? a['town'] ?? a['village'] ?? a['municipality'] ?? null,
    };
  }

  /** "Carrera 3" → "Cra 3", "Calle 5" → "Cl. 5", como se escribe en Colombia. */
  static abreviarVia(via: string): string {
    const tipos: [RegExp, string][] = [
      [/^carrera\b/i, 'Cra'],
      [/^calle\b/i, 'Cl.'],
      [/^avenida\b/i, 'Av.'],
      [/^transversal\b/i, 'Tv.'],
      [/^diagonal\b/i, 'Dg.'],
    ];
    for (const [re, corto] of tipos) if (re.test(via)) return via.replace(re, corto);
    return via;
  }

  /** Distancia aproximada en metros (suficiente para distancias cortas). */
  private metros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const r = 6371000;
    const x = (((b.lng - a.lng) * Math.PI) / 180) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    const y = ((b.lat - a.lat) * Math.PI) / 180;
    return Math.sqrt(x * x + y * y) * r;
  }

  private guardar(u: MiUbicacion): void {
    this.ubicacion.set(u);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(u));
    } catch {
      /* sin almacenamiento: queda solo en memoria */
    }
  }

  /** La última posición conocida se muestra mientras llega la primera lectura del GPS. */
  private leerGuardada(): MiUbicacion | null {
    try {
      const u = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as MiUbicacion | null;
      return u && typeof u.lat === 'number' ? { ...u, precision: u.precision ?? null } : null;
    } catch {
      return null;
    }
  }
}
