import { TestBed } from '@angular/core/testing';
import { SesionService } from './sesion.service';
import { jwtFalso, sesionFalsa } from './testing/sesion-falsa';

describe('SesionService', () => {
  let sesion: SesionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    sesion = TestBed.inject(SesionService);
  });

  it('sin sesión no está activa y manda al login', () => {
    expect(sesion.activa()).toBe(false);
    expect(sesion.rutaInicio()).toBe('/login');
  });

  it('guarda la sesión en el celular y la borra al cerrar', () => {
    sesion.guardar(sesionFalsa());
    expect(sesion.activa()).toBe(true);
    expect(localStorage.getItem('movify.sesion')).toContain('refresh-123');

    sesion.cerrar();
    expect(sesion.activa()).toBe(false);
    expect(localStorage.getItem('movify.sesion')).toBeNull();
  });

  it('lee el vencimiento (exp) del JWT', () => {
    expect(SesionService.vencimiento(jwtFalso(60))).toBeGreaterThan(Date.now() / 1000);
    expect(SesionService.vencimiento('no-es-un-jwt')).toBeNull();
  });

  it('token vencido + refresh token = sesión activa (se puede renovar)', () => {
    sesion.guardar(sesionFalsa({ token: jwtFalso(-10) }));
    expect(sesion.tokenVencido()).toBe(true);
    expect(sesion.activa()).toBe(true);
  });

  it('token vencido sin refresh token = sesión inactiva', () => {
    sesion.guardar(sesionFalsa({ token: jwtFalso(-10), refreshToken: '' }));
    expect(sesion.activa()).toBe(false);
  });

  it('toma como vencido un token al que le quedan menos de 30 segundos', () => {
    sesion.guardar(sesionFalsa({ token: jwtFalso(10) }));
    expect(sesion.tokenVencido()).toBe(true);
  });

  it('cada rol va a su inicio', () => {
    sesion.guardar(sesionFalsa());
    expect(sesion.rutaInicio()).toBe('/cliente');

    sesion.guardar(sesionFalsa({ rol: 'conductor', roles: ['conductor'], conductor: { estado: 'pendiente', motivo: null } }));
    expect(sesion.rutaInicio()).toBe('/conductor');

    sesion.guardar(sesionFalsa({ rol: 'conductor', roles: ['conductor'], conductor: { estado: 'aprobado', motivo: null } }));
    expect(sesion.rutaInicio()).toBe('/conductor/inicio');
  });

  it('tieneRol mira el rol principal y la lista de roles', () => {
    sesion.guardar(sesionFalsa({ rol: 'conductor', roles: ['conductor', 'cliente'] }));
    expect(sesion.tieneRol('cliente')).toBe(true);
    expect(sesion.tieneRol('admin')).toBe(false);
  });
});
