import { Injectable } from '@angular/core';
import { UbicacionService } from './ubicacion.service';

/** Un punto con nombre: origen o destino de un viaje. */
export interface Lugar {
  nombre: string; // "Muelle turístico"
  detalle: string | null; // "Cl. 1 #1-50, Centro"
  barrio: string | null;
  lat: number;
  lng: number;
  /** "Barrio", "Hospital", "Colegio"… (para el ícono y el detalle de la sugerencia). */
  categoria?: string | null;
}

export interface Ruta {
  puntos: { lat: number; lng: number }[];
  distanciaKm: number;
  duracionMin: number;
}

/** Un pedazo del nombre para resaltar lo que coincide con lo escrito. */
export interface Parte {
  texto: string;
  coincide: boolean;
}

interface ResultadoNominatim {
  name?: string;
  lat: string;
  lon: string;
  address?: Record<string, string | undefined>;
}

interface RespuestaPhoton {
  features: {
    geometry: { coordinates: [number, number] };
    properties: Record<string, string | undefined>;
  }[];
}

interface ElementoOverpass {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Recuadro de Buenaventura (casco urbano + alrededores): la búsqueda no se sale de aquí. */
const BUENAVENTURA = { oeste: -77.12, norte: 3.95, este: -76.9, sur: 3.78 };
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/** Buscador de OpenStreetMap pensado para "buscar mientras se escribe" (encuentra palabras a medias). */
const PHOTON = 'https://photon.komoot.io/api/';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
/** El mismo motor de rutas que usan la web (leaflet-routing-machine) y el backend (TarifaServicio). */
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const RECIENTES = 'movify.destinos.recientes';
const MAX_RECIENTES = 5;
const CATALOGO = 'movify.catalogo.buenaventura';
const VIGENCIA_CATALOGO_MS = 7 * 24 * 60 * 60 * 1000;

/** Qué lugares de OpenStreetMap entran al catálogo y cómo se llaman en la app. */
const CATEGORIAS: [string, string, string][] = [
  // [etiqueta OSM, valor, nombre en la app]
  ['place', 'neighbourhood', 'Barrio'],
  ['place', 'suburb', 'Barrio'],
  ['place', 'quarter', 'Barrio'],
  ['place', 'hamlet', 'Vereda'],
  ['place', 'village', 'Corregimiento'],
  ['amenity', 'hospital', 'Hospital'],
  ['amenity', 'clinic', 'Clínica'],
  ['amenity', 'doctors', 'Consultorio'],
  ['amenity', 'school', 'Colegio'],
  ['amenity', 'university', 'Universidad'],
  ['amenity', 'college', 'Instituto'],
  ['amenity', 'bank', 'Banco'],
  ['amenity', 'police', 'Policía'],
  ['amenity', 'marketplace', 'Galería'],
  ['amenity', 'bus_station', 'Terminal'],
  ['amenity', 'ferry_terminal', 'Muelle'],
  ['amenity', 'townhall', 'Alcaldía'],
  ['amenity', 'place_of_worship', 'Iglesia'],
  ['amenity', 'fuel', 'Estación de servicio'],
  ['amenity', 'pharmacy', 'Droguería'],
  ['amenity', 'restaurant', 'Restaurante'],
  ['amenity', 'courthouse', 'Juzgado'],
  ['tourism', 'hotel', 'Hotel'],
  ['tourism', 'attraction', 'Sitio turístico'],
  ['tourism', 'museum', 'Museo'],
  ['tourism', 'viewpoint', 'Mirador'],
  ['shop', 'supermarket', 'Supermercado'],
  ['shop', 'mall', 'Centro comercial'],
  ['leisure', 'park', 'Parque'],
  ['leisure', 'stadium', 'Estadio'],
  ['leisure', 'sports_centre', 'Polideportivo'],
  ['aeroway', 'aerodrome', 'Aeropuerto'],
];

/**
 * Buscar lugares y trazar rutas en Buenaventura (OpenStreetMap).
 *  - `sugerir`: instantáneo, sin internet, desde la primera letra (catálogo de barrios y sitios + guardados).
 *  - `buscar`: calles y direcciones en línea (Photon; si falla, Nominatim).
 * El precio y los km oficiales los calcula el backend (/api/tarifas/cotizar); aquí solo se dibuja la ruta.
 */
@Injectable({ providedIn: 'root' })
export class LugaresService {
  private catalogoListo: Promise<Lugar[]> | null = null;

  /**
   * Barrios y sitios conocidos de Buenaventura (de OpenStreetMap). Se descarga una vez y queda guardado
   * 7 días en el celular; si no hay internet se usa la copia vieja (o lista vacía).
   */
  catalogo(): Promise<Lugar[]> {
    this.catalogoListo ??= this.cargarCatalogo().catch(() => {
      this.catalogoListo = null; // se reintenta la próxima vez
      return this.catalogoGuardado()?.lugares ?? [];
    });
    return this.catalogoListo;
  }

  /**
   * Sugerencias locales mientras escribe: coincide el inicio del nombre, el inicio de una palabra o cualquier parte,
   * sin importar tildes ni mayúsculas. `primero` (guardados y recientes) gana a igualdad de puntaje.
   */
  sugerir(texto: string, catalogo: Lugar[], primero: Lugar[] = [], max = 6): Lugar[] {
    const q = normalizar(texto.trim());
    if (!q) return [];
    const palabras = q.split(/\s+/);
    const puntuados: { l: Lugar; p: number }[] = [];
    const vistos = new Set<string>();
    [...primero.map((l) => ({ l, extra: 0.5 })), ...catalogo.map((l) => ({ l, extra: 0 }))].forEach(({ l, extra }) => {
      const n = normalizar(l.nombre);
      // Todas las palabras escritas tienen que aparecer ("hospital dep" → "Hospital Departamental")
      if (!palabras.every((p) => n.includes(p))) return;
      const clave = n + '|' + l.lat.toFixed(3) + l.lng.toFixed(3);
      if (vistos.has(clave)) return;
      vistos.add(clave);
      let p = 1;
      if (n.startsWith(q)) p = 4;
      else if (n.split(/[\s,.-]+/).some((w) => w.startsWith(palabras[0]))) p = 3;
      puntuados.push({ l, p: p + extra - n.length / 1000 }); // a igual puntaje, el nombre más corto primero
    });
    return puntuados
      .sort((a, b) => b.p - a.p)
      .slice(0, max)
      .map((x) => x.l);
  }

  /** Calles, direcciones y lugares en línea ("calle 6", "carrera 3 #5") dentro de Buenaventura. */
  async buscar(texto: string, senal?: AbortSignal): Promise<Lugar[]> {
    const q = texto.trim();
    if (q.length < 3) return [];
    try {
      return await this.buscarPhoton(q, senal);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      return this.buscarNominatim(q, senal);
    }
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

  // ---------- Catálogo (Overpass) ----------

  private async cargarCatalogo(): Promise<Lugar[]> {
    const guardado = this.catalogoGuardado();
    if (guardado && Date.now() - guardado.cuando < VIGENCIA_CATALOGO_MS) return guardado.lugares;

    const b = BUENAVENTURA;
    const caja = `(${b.sur},${b.oeste},${b.norte},${b.este})`;
    const filtros = CATEGORIAS.map(([k, v]) => `nwr["${k}"="${v}"]["name"]${caja};`).join('');
    const consulta = `[out:json][timeout:25];(${filtros});out center tags 1500;`;
    const resp = await fetch(OVERPASS, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(consulta),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error('Overpass ' + resp.status);
    const { elements } = (await resp.json()) as { elements: ElementoOverpass[] };

    const lugares: Lugar[] = [];
    for (const e of elements) {
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      const t = e.tags ?? {};
      if (lat == null || lng == null || !t['name']) continue;
      const categoria = CATEGORIAS.find(([k, v]) => t[k] === v)?.[2] ?? null;
      const via = t['addr:street'] ? UbicacionService.abreviarVia(t['addr:street']) : null;
      const direccion = via ? via + (t['addr:housenumber'] ? ` #${t['addr:housenumber']}` : '') : null;
      const esBarrio = categoria === 'Barrio' || categoria === 'Vereda' || categoria === 'Corregimiento';
      lugares.push({
        nombre: t['name'],
        detalle: [categoria, direccion].filter(Boolean).join(' · ') || null,
        barrio: esBarrio ? t['name'] : (t['addr:suburb'] ?? null),
        lat,
        lng,
        categoria,
      });
    }
    try {
      localStorage.setItem(CATALOGO, JSON.stringify({ cuando: Date.now(), lugares }));
    } catch {
      /* sin espacio: queda solo en memoria */
    }
    return lugares;
  }

  private catalogoGuardado(): { cuando: number; lugares: Lugar[] } | null {
    try {
      const c = JSON.parse(localStorage.getItem(CATALOGO) ?? 'null') as { cuando: number; lugares: Lugar[] } | null;
      return c && Array.isArray(c.lugares) ? c : null;
    } catch {
      return null;
    }
  }

  // ---------- Búsqueda en línea ----------

  private async buscarPhoton(q: string, senal?: AbortSignal): Promise<Lugar[]> {
    const b = BUENAVENTURA;
    const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=8&bbox=${b.oeste},${b.sur},${b.este},${b.norte}`;
    const resp = await fetch(url, { signal: senal ?? AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error('Photon ' + resp.status);
    const r = (await resp.json()) as RespuestaPhoton;
    return unicos(
      r.features.map(({ geometry, properties: p }) => {
        const via = p['street'] ? UbicacionService.abreviarVia(p['street']) : null;
        const direccion = via ? via + (p['housenumber'] ? ` #${p['housenumber']}` : '') : null;
        const barrio = p['district'] ?? p['locality'] ?? null;
        const nombre = p['name'] ? (p['osm_key'] === 'highway' ? UbicacionService.abreviarVia(p['name']) : p['name']) : (direccion ?? barrio ?? 'Punto en Buenaventura');
        const detalle = [nombre === direccion ? null : direccion, nombre === barrio ? null : barrio].filter(Boolean).join(', ') || null;
        return { nombre, detalle, barrio, lat: geometry.coordinates[1], lng: geometry.coordinates[0], categoria: p['osm_key'] === 'highway' ? 'Calle' : null };
      }),
    );
  }

  private async buscarNominatim(q: string, senal?: AbortSignal): Promise<Lugar[]> {
    const b = BUENAVENTURA;
    const url =
      `${NOMINATIM}?format=jsonv2&addressdetails=1&limit=8&accept-language=es&countrycodes=co&bounded=1` +
      `&viewbox=${b.oeste},${b.norte},${b.este},${b.sur}&q=${encodeURIComponent(q)}`;
    const resp = await fetch(url, { signal: senal ?? AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error('No pudimos buscar la dirección');
    return unicos(((await resp.json()) as ResultadoNominatim[]).map((r) => this.deNominatim(r)));
  }

  private deNominatim(r: ResultadoNominatim): Lugar {
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

/**
 * Minúsculas y sin tildes, letra por letra (mismo largo que el original, para poder resaltar).
 * "Hospital Luis Ablanque" → "hospital luis ablanque"; "Ñ" → "n".
 */
export function normalizar(texto: string): string {
  return Array.from(texto, (c) => c.normalize('NFD')[0].toLowerCase()).join('');
}

/** Parte el nombre en pedazos para resaltar dónde aparece cada palabra escrita. */
export function resaltar(nombre: string, texto: string): Parte[] {
  const n = normalizar(nombre);
  const marcas = new Array<boolean>(nombre.length).fill(false);
  for (const p of normalizar(texto.trim()).split(/\s+/).filter(Boolean)) {
    const i = n.indexOf(p);
    if (i >= 0) marcas.fill(true, i, i + p.length);
  }
  const partes: Parte[] = [];
  Array.from(nombre).forEach((c, i) => {
    const ultima = partes[partes.length - 1];
    if (ultima && ultima.coincide === marcas[i]) ultima.texto += c;
    else partes.push({ texto: c, coincide: marcas[i] });
  });
  return partes;
}

/** Quita resultados repetidos (mismo nombre y casi el mismo punto). */
function unicos(lista: Lugar[]): Lugar[] {
  const vistos = new Set<string>();
  return lista.filter((l) => {
    const clave = `${normalizar(l.nombre)}|${l.lat.toFixed(3)},${l.lng.toFixed(3)}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}
