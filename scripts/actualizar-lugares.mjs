// Descarga de OpenStreetMap (Overpass) los barrios y sitios con nombre de Buenaventura y los guarda en
// src/assets/datos/lugares-buenaventura.json. La app usa ese archivo para sugerir lugares mientras se escribe
// (sin internet y desde la primera letra); qué categorías se muestran lo decide lugares.service.ts.
//
// Uso (desde MoviFY-movil):   node scripts/actualizar-lugares.mjs
// Datos © colaboradores de OpenStreetMap (licencia ODbL).

import { mkdir, writeFile } from 'node:fs/promises';

const CAJA = '(3.78,-77.12,3.95,-76.9)'; // sur, oeste, norte, este
const CLAVES = ['place', 'amenity', 'tourism', 'shop', 'leisure', 'aeroway'];
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const DESTINO = new URL('../src/assets/datos/lugares-buenaventura.json', import.meta.url);

const consulta = `[out:json][timeout:90];(${CLAVES.map((k) => `nwr["${k}"]["name"]${CAJA};`).join('')});out center tags;`;

let datos;
for (const url of SERVIDORES) {
  try {
    console.log('Consultando', url, '…');
    const resp = await fetch(url, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(consulta),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'MoviFY/1.0 (proyecto Univalle Pacifico)' },
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    datos = await resp.json();
    break;
  } catch (e) {
    console.warn('  falló:', e.message);
  }
}
if (!datos) {
  console.error('No se pudo descargar de ningún servidor. Intenta más tarde.');
  process.exit(1);
}

// Solo lo que usa la app: posición y unas pocas etiquetas (el archivo queda pequeño)
const ETIQUETAS = ['name', ...CLAVES, 'addr:street', 'addr:housenumber', 'addr:suburb'];
const elementos = datos.elements
  .map((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) return null;
    const tags = Object.fromEntries(ETIQUETAS.filter((t) => e.tags?.[t]).map((t) => [t, e.tags[t]]));
    return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)), tags };
  })
  .filter(Boolean);

await mkdir(new URL('.', DESTINO), { recursive: true });
await writeFile(DESTINO, JSON.stringify({ generado: new Date().toISOString(), fuente: '© OpenStreetMap contributors (ODbL)', elements: elementos }));
console.log(`Listo: ${elementos.length} lugares en ${DESTINO.pathname}`);
