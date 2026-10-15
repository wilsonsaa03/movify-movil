import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { invitadoGuard, rolGuard } from './auth.guards';
import { SesionService } from './sesion.service';
import { jwtFalso, sesionFalsa } from './testing/sesion-falsa';

describe('Guards de sesión', () => {
  let sesion: SesionService;
  let router: Router;

  const correr = (guard: typeof rolGuard, roles: string[] = []) =>
    TestBed.runInInjectionContext(() =>
      guard({ data: { roles } } as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  const url = (r: unknown) => router.serializeUrl(r as UrlTree);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    sesion = TestBed.inject(SesionService);
    router = TestBed.inject(Router);
  });

  it('rolGuard: sin sesión manda al login', () => {
    expect(url(correr(rolGuard, ['cliente']))).toBe('/login');
  });

  it('rolGuard: con sesión vencida y sin refresh token la borra y manda al login', () => {
    sesion.guardar(sesionFalsa({ token: jwtFalso(-10), refreshToken: '' }));
    expect(url(correr(rolGuard, ['cliente']))).toBe('/login');
    expect(sesion.datos()).toBeNull();
  });

  it('rolGuard: deja pasar al rol correcto', () => {
    sesion.guardar(sesionFalsa());
    expect(correr(rolGuard, ['cliente'])).toBe(true);
  });

  it('rolGuard: un cliente no entra al panel del conductor', () => {
    sesion.guardar(sesionFalsa());
    expect(url(correr(rolGuard, ['conductor']))).toBe('/cliente');
  });

  it('invitadoGuard: sin sesión deja ver el login', () => {
    expect(correr(invitadoGuard)).toBe(true);
  });

  it('invitadoGuard: con sesión salta el login y va a su inicio', () => {
    sesion.guardar(sesionFalsa({ rol: 'conductor', roles: ['conductor'], conductor: { estado: 'aprobado', motivo: null } }));
    expect(url(correr(invitadoGuard))).toBe('/conductor/inicio');
  });
});
