import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { NotificacionesService, grupoDia, haceCuanto } from './notificaciones.service';

const API = environment.apiUrl;
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('NotificacionesService', () => {
  let servicio: NotificacionesService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NavController, useValue: { navigateRoot: vi.fn() } }],
    });
    servicio = TestBed.inject(NotificacionesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('trae la página y actualiza el número de la campana', async () => {
    const p = servicio.pagina(0);
    await esperar();
    http.expectOne(API + '/notificaciones?pagina=0&tamano=30').flush({ items: [], hay_mas: false, no_leidas: 3 });
    await p;
    expect(servicio.noLeidas()).toBe(3);
  });

  it('al leer una o todas baja el número', async () => {
    const p = servicio.leida(7);
    await esperar();
    http.expectOne(API + '/notificaciones/7/leida').flush({ no_leidas: 1 });
    await p;
    expect(servicio.noLeidas()).toBe(1);

    const t = servicio.leerTodas();
    await esperar();
    http.expectOne(API + '/notificaciones/leer-todas').flush({ marcadas: 1, no_leidas: 0 });
    await t;
    expect(servicio.noLeidas()).toBe(0);
  });

  it('agrupa por día y dice hace cuánto', () => {
    const ahora = new Date(2026, 9, 25, 18, 0);
    expect(grupoDia(new Date(2026, 9, 25, 7, 0).toISOString(), ahora)).toBe('Hoy');
    expect(grupoDia(new Date(2026, 9, 24, 23, 0).toISOString(), ahora)).toBe('Ayer');
    expect(haceCuanto(new Date(ahora.getTime() - 5 * 60000).toISOString(), ahora.getTime())).toBe('Hace 5 min');
    expect(haceCuanto(new Date(ahora.getTime() - 3 * 3600000).toISOString(), ahora.getTime())).toBe('Hace 3 h');
  });
});
