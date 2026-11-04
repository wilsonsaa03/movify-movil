import { signal } from '@angular/core';

/** App con la que el conductor quiere navegar (como WayCali: Google Maps o Waze con un toque). */
export type AppNavegacion = 'google' | 'waze';

const CLAVE = 'movify.app_navegacion';

function leer(): AppNavegacion {
  try {
    return localStorage.getItem(CLAVE) === 'waze' ? 'waze' : 'google';
  } catch {
    return 'google';
  }
}

/** La preferencia se guarda en este celular. */
export const appNavegacion = signal<AppNavegacion>(leer());

export function guardarAppNavegacion(app: AppNavegacion): void {
  appNavegacion.set(app);
  try {
    localStorage.setItem(CLAVE, app);
  } catch {
    // sin almacenamiento: dura mientras la app esté abierta
  }
}

/**
 * Enlace universal: en el celular abre la app (si está instalada) y si no, la página web.
 * Google: https://developers.google.com/maps/documentation/urls/get-started · Waze: https://developers.google.com/waze/deeplinks
 */
export function urlNavegacion(app: AppNavegacion, lat: number, lng: number): string {
  const punto = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return app === 'waze'
    ? `https://waze.com/ul?ll=${punto}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${punto}&travelmode=driving`;
}

/** Abre la navegación hasta el punto con la app preferida. */
export function navegarA(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return false;
  window.open(urlNavegacion(appNavegacion(), Number(lat), Number(lng)), '_blank', 'noopener');
  return true;
}

export function nombreAppNavegacion(app: AppNavegacion): string {
  return app === 'waze' ? 'Waze' : 'Google Maps';
}
