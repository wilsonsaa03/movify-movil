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
import { LoginGooglePage } from './login-google.page';

const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('LoginGooglePage', () => {
  let http: HttpTestingController;
  let nav: { navigateRoot: ReturnType<typeof vi.fn>; navigateBack: ReturnType<typeof vi.fn>; navigateForward: ReturnType<typeof vi.fn> };
  /** Google de mentira: guarda la función que Google llamaría al elegir una cuenta. */
  let elegirCuenta: (token: string) => void;

  const crear = async (disponible = true) => {
    // Servicio real (así se prueba también entrar(): backend + sesión + navegación); solo se simula Google
    const google = TestBed.inject(GoogleAuthService);
    vi.spyOn(google, 'disponible').mockReturnValue(disponible);
    vi.spyOn(google, 'mostrarBoton').mockImplementation(async (_el: HTMLElement, cb: (t: string) => void) => {
      elegirCuenta = cb;
    });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(LoginGooglePage);
    f.detectChanges();
    await esperar();
    return f.componentInstance;
  };

  beforeEach(() => {
    localStorage.clear();
    nav = { navigateRoot: vi.fn(), navigateBack: vi.fn(), navigateForward: vi.fn() };
    TestBed.configureTestingModule({
      imports: [LoginGooglePage],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: NavController, useValue: nav },
      ],
    });
  });

  afterEach(() => http.verify());

  it('muestra el botón de Google cuando carga', async () => {
    const p = await crear();
    expect(p.estado()).toBe('listo');
  });

  it('manda el id_token al backend, guarda la sesión y entra', async () => {
    const p = await crear();
    elegirCuenta('id-token-de-google');
    await esperar();
    const req = http.expectOne(environment.apiUrl + '/auth/login-google');
    expect(req.request.body).toEqual({ token: 'id-token-de-google' });
    req.flush(sesionFalsa());
    await esperar();
    expect(TestBed.inject(SesionService).activa()).toBe(true);
    expect(nav.navigateRoot).toHaveBeenCalledWith('/cliente', { queryParams: {} });
    expect(p.error()).toBe('');
  });

  it('si el backend rechaza el token muestra el error y no guarda sesión', async () => {
    const p = await crear();
    elegirCuenta('token-malo');
    await esperar();
    http
      .expectOne(environment.apiUrl + '/auth/login-google')
      .flush({ error: 'No pudimos verificar tu cuenta de Google' }, { status: 401, statusText: 'x' });
    await esperar();
    expect(p.error()).toBe('No pudimos verificar tu cuenta de Google');
    expect(p.estado()).toBe('listo');
    expect(TestBed.inject(SesionService).datos()).toBeNull();
  });

  it('dentro del APK (sin plugin nativo todavía) ofrece entrar con el celular', async () => {
    const p = await crear(false);
    expect(p.estado()).toBe('nativo');
  });
});
