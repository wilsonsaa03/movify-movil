import { Injectable } from '@angular/core';
import { UbicacionService } from './ubicacion.service';

/** Un punto con nombre: origen o destino de un viaje. */
export interface Lugar {
  nombre: string; // "Muelle turístico"
  detalle: string | null; // "Cl. 1 #1-50, Centro"
  barrio: string | null;
  lat: number;
  lng: number;
}

export interface Ruta {
  puntos: { lat: number; lng: number }[];
  distanciaKm: number;
  duracionMin: number;
}

interface ResultadoNominatim {
  name?: string;
  lat: string;
  lon: string;
  address?: Record<string, string | undefined>;
}

/** Recuadro de Buenaventura (casco urbano + alrededores): la búsqueda no se sale de aquí. */
const BUENAVENTURA = { oeste: -77.12, norte: 3.95, este: -76.9, sur: 3.78 };
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/** El mismo motor de rutas que usan la web (leaflet-routing-machine) y el backend (TarifaServicio). */
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const RECIENTES = 'movify.destinos.recientes';
const MAX_RECIENTES = 5;

/**
 * Buscar direcciones y trazar rutas en Buenaventura (OpenStreetMap).
 * El precio y los km oficiales los calcula el backend (/api/tarifas/cotizar); aquí solo se dibuja la ruta.
 */
@Injectable({ providedIn: 'root' })
export class LugaresService {
  /** Busca lugares o direcciones ("muelle", "calle 6 # 4") dentro de Buenaventura. */
  async buscar(texto: string, senal?: AbortSignal): Promise<Lugar[]> {
    const q = texto.trim();
    if (q.length < 3) return [];
    const b = BUENAVENTURA;
    const url =
      `${NOMINATIM}?format=jsonv2&addressdetails=1&limit=8&accept-language=es&countrycodes=co&bounded=1` +
      `&viewbox=${b.oeste},${b.norte},${b.este},${b.sur}&q=${encodeURIComponent(q)}`;
    const resp = await fetch(url, { signal: senal ?? AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error('No pudimos buscar la dirección');
    const lista = (await resp.json()) as ResultadoNominatim[];

    const vistos = new Set<string>();
    return lista
      .map((r) => this.aLugar(r))
      .filter((l) => {
        const clave = `${l.nombre}|${l.detalle}`;
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });
  }

  /** Ruta por calles (OSRM). Si no responde, línea recta: el mapa igual muestra hacia dónde va. */
  async ruta(o: { lat: number; lng: number }, d: { lat: number; lng: number }): Promise<Ruta> {
    try {
      const url = `${OSRM}/${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) throw new Error('OSRM ' + resp.status);
      const r = (await resp.json()) as { routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] };
      const ruta = r.routes?.[0];
      if (!ruta) throw new Error('sin ruta');
      return {
        puntos: ruta.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        distanciaKm: ruta.distance / 1000,
        duracionMin: Math.max(1, Math.round(ruta.duration / 60)),
      };
    } catch {
      const km = distanciaKm(o, d) * 1.3;
      return { puntos: [o, d], distanciaKm: km, duracionMin: Math.max(1, Math.round(km * 3)) };
    }
  }

  recientes(): Lugar[] {
    try {
      const l = JSON.parse(localStorage.getItem(RECIENTES) ?? '[]') as Lugar[];
      return Array.isArray(l) ? l.filter((x) => typeof x?.lat === 'number').slice(0, MAX_RECIENTES) : [];
    } catch {
      return [];
    }
  }

  /** Guarda el destino elegido arriba de la lista de recientes (sin repetir). */
  recordar(l: Lugar): void {
    const resto = this.recientes().filter((r) => distanciaKm(r, l) > 0.03 || r.nombre !== l.nombre);
    try {
      localStorage.setItem(RECIENTES, JSON.stringify([l, ...resto].slice(0, MAX_RECIENTES)));
    } catch {
      /* sin almacenamiento */
    }
  }

  private aLugar(r: ResultadoNominatim): Lugar {
    const a = r.address ?? {};
    const via = a['road'] ? UbicacionService.abreviarVia(a['road']) : null;
    const numero = a['house_number'] ? ` #${a['house_number'].replace(/^#\s*/, '')}` : '';
    const direccion = via ? via + numero : null;
    const barrio = a['neighbourhood'] ?? a['suburb'] ?? a['quarter'] ?? a['residential'] ?? a['city_district'] ?? null;
    const nombre = r.name?.trim() || direccion || barrio || 'Punto en Buenaventura';
    const detalle = [nombre === direccion ? null : direccion, nombre === barrio ? null : barrio].filter(Boolean).join(', ') || null;
    return { nombre, detalle, barrio, lat: Number(r.lat), lng: Number(r.lon) };
  }
}

/** Distancia en línea recta (km). */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
