import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { ViajeActivoService, iniciales, pantallaConductor, primerNombre, telefonoLimpio } from './viaje-activo.service';

const API = environment.apiUrl;
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('ViajeActivoService', () => {
  let viajes: ViajeActivoService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NavController, useValue: { navigateRoot: vi.fn() } }],
    });
    viajes = TestBed.inject(ViajeActivoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('el conductor retoma el viaje en la pantalla que toca', () => {
    expect(pantallaConductor({ estado_codigo: 'asignado', tipo_servicio: 'transporte' })).toBe('/conductor/viaje/recogida');
    // En el viaje, al llegar se pide el PIN; en domicilio y encomienda se sigue a "en viaje"
    expect(pantallaConductor({ estado_codigo: 'en_origen', tipo_servicio: 'transporte' })).toBe('/conductor/viaje/pin');
    expect(pantallaConductor({ estado_codigo: 'en_origen', tipo_servicio: 'domicilio' })).toBe('/conductor/viaje/en-curso');
    expect(pantallaConductor({ estado_codigo: 'en_curso', tipo_servicio: 'transporte' })).toBe('/conductor/viaje/en-curso');
    expect(pantallaConductor({ estado_codigo: 'finalizado', tipo_servicio: 'transporte' })).toBeNull();
  });

  it('arma iniciales, primer nombre y teléfono para tel:', () => {
    expect(iniciales('Ana María Valencia')).toBe('AM');
    expect(primerNombre('  Carlos Angulo ')).toBe('Carlos');
    expect(primerNombre(null, 'tu pasajero')).toBe('tu pasajero');
    expect(telefonoLimpio('+57 310 555-0142')).toBe('+573105550142');
  });

  it('inicia el viaje mandando el PIN del pasajero', async () => {
    const p = viajes.avanzar(7, { estado: 'en_curso', codigo_abordaje: '4827' });
    await esperar();
    const req = http.expectOne(API + '/servicios/7/estado');
    expect(req.request.body).toEqual({ estado: 'en_curso', codigo_abordaje: '4827' });
    req.flush({ estado_codigo: 'en_curso' });
    await p;
  });

  it('califica con estrellas y comentario', async () => {
    const p = viajes.calificar(7, 5, 'Muy amable, Pagó completo');
    await esperar();
    const req = http.expectOne(API + '/servicios/7/calificar');
    expect(req.request.body).toEqual({ puntuacion: 5, comentario: 'Muy amable, Pagó completo' });
    req.flush({ message: 'ok' });
    await p;
  });
});
