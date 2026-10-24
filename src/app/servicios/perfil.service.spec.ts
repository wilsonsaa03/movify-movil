import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { SesionService } from '../core/sesion.service';
import { sesionFalsa } from '../core/testing/sesion-falsa';
import { urlFoto } from '../core/formato';
import { PerfilService, claveDebil } from './perfil.service';

const API = environment.apiUrl;
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('PerfilService', () => {
  let perfil: PerfilService;
  let sesion: SesionService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NavController, useValue: { navigateRoot: vi.fn() } }],
    });
    perfil = TestBed.inject(PerfilService);
    sesion = TestBed.inject(SesionService);
    http = TestBed.inject(HttpTestingController);
    sesion.guardar(sesionFalsa());
  });

  afterEach(() => http.verify());

  it('rechaza claves fáciles como en el registro', () => {
    expect(claveDebil('1234')).toBe(true);
    expect(claveDebil('4321')).toBe(true);
    expect(claveDebil('7777')).toBe(true);
    expect(claveDebil('12a4')).toBe(true);
    expect(claveDebil('2468')).toBe(false);
  });

  it('arma la URL completa de la foto (en el celular la app no está en el mismo servidor)', () => {
    expect(urlFoto('/api/usuarios/7/foto/abc.jpg')).toBe(environment.apiUrl.replace(/\/api\/?$/, '') + '/api/usuarios/7/foto/abc.jpg');
    expect(urlFoto('https://otro.co/f.jpg')).toBe('https://otro.co/f.jpg');
    expect(urlFoto(null)).toBeNull();
  });

  it('al guardar los datos, el nombre nuevo pasa a la sesión', async () => {
    const p = perfil.actualizar({ nombres: 'Ana', apellidos: 'Riascos', correo: '' });
    await esperar();
    const req = http.expectOne(API + '/usuarios/perfil');
    expect(req.request.method).toBe('PUT');
    req.flush({ nombre: 'Ana Riascos', nombres: 'Ana', apellidos: 'Riascos', correo: null });
    await p;
    expect(sesion.datos()?.nombre).toBe('Ana Riascos');
  });

  it('borra un lugar guardado con DELETE', async () => {
    const p = perfil.borrarLugar(5);
    await esperar();
    const req = http.expectOne(API + '/usuarios/direcciones/5');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    await p;
  });

  it('eliminar la cuenta cierra la sesión', async () => {
    const p = perfil.eliminarCuenta();
    await esperar();
    http.expectOne(API + '/usuarios/cuenta').flush({});
    await p;
    expect(sesion.datos()).toBeNull();
  });
});
