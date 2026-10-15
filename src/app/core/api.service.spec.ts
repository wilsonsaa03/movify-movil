import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { ApiService, ErrorApi } from './api.service';
import { authInterceptor } from './auth.interceptor';
import { SesionService } from './sesion.service';
import { jwtFalso, sesionFalsa } from './testing/sesion-falsa';

const API = environment.apiUrl;

/** Deja que corran las promesas pendientes antes de mirar las peticiones. */
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('ApiService · manejo del JWT', () => {
  let api: ApiService;
  let sesion: SesionService;
  let http: HttpTestingController;
  let nav: { navigateRoot: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    nav = { navigateRoot: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: NavController, useValue: nav },
      ],
    });
    api = TestBed.inject(ApiService);
    sesion = TestBed.inject(SesionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('manda el JWT en el header Authorization', async () => {
    sesion.guardar(sesionFalsa());
    const p = api.get('/usuarios/perfil');
    await esperar();
    const req = http.expectOne(API + '/usuarios/perfil');
    expect(req.request.headers.get('Authorization')).toBe('Bearer ' + sesion.token);
    req.flush({ ok: true });
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('login con clave incorrecta: muestra el 401 y no guarda sesión', async () => {
    const p = api.post('/auth/login-celular', { celular: '3001234567', clave: '0000' });
    await esperar();
    http
      .expectOne(API + '/auth/login-celular')
      .flush({ error: 'Celular o clave incorrectos' }, { status: 401, statusText: 'Unauthorized' });
    await expect(p).rejects.toEqual(new ErrorApi('Celular o clave incorrectos', 401));
    expect(sesion.datos()).toBeNull();
    expect(http.match(API + '/auth/refresh')).toHaveLength(0);
  });

  it('token vencido: lo renueva antes de llamar', async () => {
    sesion.guardar(sesionFalsa({ token: jwtFalso(-10) }));
    const nuevo = jwtFalso(3600);
    const p = api.get('/usuarios/perfil');
    await esperar();
    const refresh = http.expectOne(API + '/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-123' });
    refresh.flush(sesionFalsa({ token: nuevo, refreshToken: 'refresh-456' }));
    await esperar();
    const req = http.expectOne(API + '/usuarios/perfil');
    expect(req.request.headers.get('Authorization')).toBe('Bearer ' + nuevo);
    req.flush({ ok: true });
    await expect(p).resolves.toEqual({ ok: true });
    expect(sesion.refreshToken).toBe('refresh-456');
  });

  it('401 del backend: renueva una vez y repite la llamada', async () => {
    sesion.guardar(sesionFalsa());
    const p = api.get('/usuarios/perfil');
    await esperar();
    http.expectOne(API + '/usuarios/perfil').flush({ error: 'Debes iniciar sesión' }, { status: 401, statusText: 'x' });
    await esperar();
    http.expectOne(API + '/auth/refresh').flush(sesionFalsa({ token: jwtFalso(3600) }));
    await esperar();
    http.expectOne(API + '/usuarios/perfil').flush({ ok: true });
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('refresh token vencido: cierra la sesión y vuelve al login con el aviso', async () => {
    sesion.guardar(sesionFalsa({ token: jwtFalso(-10) }));
    const p = api.get('/usuarios/perfil');
    await esperar();
    http
      .expectOne(API + '/auth/refresh')
      .flush({ error: 'Tu sesión venció. Inicia sesión de nuevo.' }, { status: 401, statusText: 'x' });
    await expect(p).rejects.toMatchObject({ status: 401 });
    expect(sesion.datos()).toBeNull();
    expect(nav.navigateRoot).toHaveBeenCalledWith('/login', { queryParams: { expirada: 1 } });
  });

  it('sin internet al renovar: NO cierra la sesión', async () => {
    sesion.guardar(sesionFalsa({ token: jwtFalso(-10) }));
    const p = api.get('/usuarios/perfil');
    await esperar();
    http.expectOne(API + '/auth/refresh').error(new ProgressEvent('error'), { status: 0 });
    await esperar();
    http.expectOne(API + '/usuarios/perfil').error(new ProgressEvent('error'), { status: 0 });
    await expect(p).rejects.toMatchObject({ status: 0 });
    expect(sesion.datos()).not.toBeNull();
    expect(nav.navigateRoot).not.toHaveBeenCalled();
  });

  it('cerrar sesión: borra el token y anula el refresh token en el backend', async () => {
    sesion.guardar(sesionFalsa());
    const p = api.cerrarSesion();
    expect(sesion.datos()).toBeNull();
    const req = http.expectOne(API + '/auth/logout');
    expect(req.request.body).toEqual({ refreshToken: 'refresh-123' });
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ message: 'Sesión cerrada' });
    await p;
  });
});
