import { RespuestaSesion } from '../sesion.service';

/** Datos de prueba para los .spec.ts (no entra al build de la app). */

/** Arma un JWT de mentira (sin firma real) que vence en "segundos" a partir de ahora. */
export function jwtFalso(segundos: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + segundos;
  return `${b64({ alg: 'HS256' })}.${b64({ sub: '1', tipo: 'acceso', rol: 'cliente', exp })}.firma`;
}

export function sesionFalsa(cambios: Partial<RespuestaSesion> = {}): RespuestaSesion {
  return {
    token: jwtFalso(3600),
    refreshToken: 'refresh-123',
    id: 1,
    rol: 'cliente',
    roles: ['cliente'],
    nombre: 'Wilson Prueba',
    nombres: 'Wilson',
    apellidos: 'Prueba',
    correo: null,
    telefono: '+573001234567',
    foto: null,
    conductor: null,
    ...cambios,
  };
}
