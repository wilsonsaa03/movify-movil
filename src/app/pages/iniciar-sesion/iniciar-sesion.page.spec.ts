import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NavController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth.interceptor';
import { SesionService } from '../../core/sesion.service';
import { sesionFalsa } from '../../core/testing/sesion-falsa';
import { GoogleAuthService } from '../../servicios/google-auth.service';
import { IniciarSesionPage } from './iniciar-sesion.page';

const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('IniciarSesionPage', () => {
  let http: HttpTestingController;
  let nav: { navigateRoot: ReturnType<typeof vi.fn>; navigateBack: ReturnType<typeof vi.fn>; navigateForward: ReturnType<typeof vi.fn> };
  /** Google de mentira: guarda la función que Google llamaría al elegir una cuenta. */
  let elegirCuenta: (token: string) => void;

  const crear = async (disponible = true) => {
    const google = TestBed.inject(GoogleAuthService);
    vi.spyOn(google, 'disponible').mockReturnValue(disponible);
    vi.spyOn(google, 'mostrarBoton').mockImplementation(async (_el: HTMLElement, cb: (t: string) => void) => {
      elegirCuenta = cb;
    });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(IniciarSesionPage);
    f.detectChanges();
    await esperar();
    return f.componentInstance;
  };

  beforeEach(() => {
    localStorage.clear();
    nav = { navigateRoot: vi.fn(), navigateBack: vi.fn(), navigateForward: vi.fn() };
    TestBed.configureTestingModule({
      imports: [IniciarSesionPage],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: NavController, useValue: nav },
      ],
    });
  });

  afterEach(() => http.verify());

  it('muestra el botón de Google en la misma pantalla del celular', async () => {
    const p = await crear();
    expect(p.estadoGoogle()).toBe('listo');
  });

  it('con Google entra directo desde aquí (sin pasar por /login/google)', async () => {
    const p = await crear();
    elegirCuenta('id-token-de-google');
    await esperar();
    const req = http.expectOne(environment.apiUrl + '/auth/login-google');
    expect(req.request.body).toEqual({ token: 'id-token-de-google' });
    req.flush(sesionFalsa());
    await esperar();
    expect(TestBed.inject(SesionService).activa()).toBe(true);
    expect(nav.navigateRoot).toHaveBeenCalledWith('/cliente', { queryParams: {} });
    expect(p.errorGoogle()).toBe('');
  });

  it('si Google o el backend fallan, muestra el error y deja intentar de nuevo', async () => {
    const p = await crear();
    elegirCuenta('token-malo');
    await esperar();
    http
      .expectOne(environment.apiUrl + '/auth/login-google')
      .flush({ error: 'No pudimos verificar tu cuenta de Google' }, { status: 401, statusText: 'x' });
    await esperar();
    expect(p.errorGoogle()).toBe('No pudimos verificar tu cuenta de Google');
    expect(p.estadoGoogle()).toBe('listo');
    expect(TestBed.inject(SesionService).datos()).toBeNull();
  });

  it('en el APK (sin plugin nativo) el botón de Google abre la pantalla que lo explica', async () => {
    const p = await crear(false);
    expect(p.estadoGoogle()).toBe('nativo');
  });

  it('atrás sin pantalla anterior en la app vuelve al inicio', async () => {
    const p = await crear();
    p.alInicio();
    expect(nav.navigateBack).toHaveBeenCalledWith('/inicio');
  });
});
