import { environment } from '../../environments/environment';

const miles = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/**
 * El backend guarda la foto como ruta relativa ("/api/usuarios/7/foto/abc.jpg"). En el celular la app no corre
 * en el mismo origen que el backend: hay que ponerle el servidor delante o la imagen no carga.
 */
export function urlFoto(foto: string | null | undefined): string | null {
  if (!foto) return null;
  if (/^(https?:|data:|blob:)/.test(foto)) return foto;
  const servidor = environment.apiUrl.replace(/\/api\/?$/, '');
  return servidor + (foto.startsWith('/') ? foto : '/' + foto);
}

/** $6.500 (sin el espacio que pone Intl con style 'currency'). */
export function pesos(n: number | null | undefined): string {
  return '$' + miles.format(Math.round(Number(n) || 0));
}

/** 4,2 km · 600 m */
export function distancia(km: number): string {
  return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}
