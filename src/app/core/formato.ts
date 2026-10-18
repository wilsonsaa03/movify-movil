const miles = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** $6.500 (sin el espacio que pone Intl con style 'currency'). */
export function pesos(n: number | null | undefined): string {
  return '$' + miles.format(Math.round(Number(n) || 0));
}

/** 4,2 km · 600 m */
export function distancia(km: number): string {
  return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}
