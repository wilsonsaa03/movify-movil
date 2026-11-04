import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { SesionService } from '../core/sesion.service';
import { sesionFalsa } from '../core/testing/sesion-falsa';
import {
  GananciasService,
  META_MAX,
  META_MIN,
  META_POR_DEFECTO,
  duracion,
  esBarraActual,
  etiquetaBarra,
  metaValida,
  nombreBarra,
  tipoGanancia,
} from './ganancias.service';

const API = environment.apiUrl;
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('GananciasService', () => {
  let servicio: GananciasService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NavController, useValue: { navigateRoot: vi.fn() } },
      ],
    });
    TestBed.inject(SesionService).guardar(sesionFalsa({ id: 42, rol: 'conductor', roles: ['conductor'] }));
    servicio = TestBed.inject(GananciasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide el resumen del periodo para el conductor de la sesión', async () => {
    const p = servicio.resumen('semana');
    await esperar();
    http.expectOne(API + '/transporte/ganancias-resumen/42?periodo=semana').flush({ total: 52000, barras: [], por_tipo: [] });
    expect((await p).total).toBe(52000);
  });

  it('la meta arranca en $80.000, se redondea a miles, tiene tope y queda guardada', () => {
    expect(servicio.meta()).toBe(META_POR_DEFECTO);
    expect(servicio.guardarMeta(95400)).toBe(95000);
    expect(servicio.meta()).toBe(95000);
    expect(localStorage.getItem('movify.meta_dia')).toBe('95000');
    expect(metaValida(500)).toBe(META_MIN);
    expect(metaValida(9_000_000)).toBe(META_MAX);
  });

  it('nombra las barras en hora de Colombia sin correrse por la zona del celular', () => {
    expect(etiquetaBarra('2026-10-25T15:00', 'hoy')).toBe('3p');
    expect(etiquetaBarra('2026-10-25T00:00', 'hoy')).toBe('12a');
    expect(nombreBarra('2026-10-25T21:00', 'hoy')).toBe('De 9 p. m. a 12 a. m.');
    expect(etiquetaBarra('2026-10-20T00:00', 'semana')).toBe('M'); // martes
    expect(nombreBarra('2026-10-20T00:00', 'semana')).toBe('Martes 20');
    expect(etiquetaBarra('2026-10-01T00:00', 'mes')).toBe('1');
    expect(etiquetaBarra('2026-10-07T00:00', 'mes')).toBe('');
    expect(etiquetaBarra('2026-10-15T00:00', 'mes')).toBe('15');
  });

  it('resalta la barra del momento actual', () => {
    const ahora = new Date(2026, 9, 25, 16, 30);
    expect(esBarraActual('2026-10-25T15:00', 'hoy', ahora)).toBe(true);
    expect(esBarraActual('2026-10-25T18:00', 'hoy', ahora)).toBe(false);
    expect(esBarraActual('2026-10-25T00:00', 'mes', ahora)).toBe(true);
    expect(esBarraActual('2026-10-24T00:00', 'semana', ahora)).toBe(false);
  });

  it('formatea tiempo y tipos', () => {
    expect(duracion(45)).toBe('45 min');
    expect(duracion(200)).toBe('3 h 20 min');
    expect(duracion(120)).toBe('2 h');
    expect(tipoGanancia('taxi').icono).toBe('taxi');
    expect(tipoGanancia('encomienda').nombre).toBe('Encomiendas');
    expect(tipoGanancia('moto').icono).toBe('moto');
  });
});
