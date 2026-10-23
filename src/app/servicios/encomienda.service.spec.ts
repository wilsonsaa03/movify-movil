import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { EncomiendaService, celularValido, nombrePaquete } from './encomienda.service';

const API = environment.apiUrl;

/** Deja que corran las promesas pendientes antes de mirar las peticiones. */
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('EncomiendaService', () => {
  let envio: EncomiendaService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NavController, useValue: { navigateRoot: vi.fn() } }],
    });
    envio = TestBed.inject(EncomiendaService);
    http = TestBed.inject(HttpTestingController);
    envio.origen.set({ nombre: 'Mi ubicación', detalle: 'Cra 3 #5-20', barrio: 'La Playita', lat: 3.88, lng: -77.03 });
    envio.destino.set({ nombre: 'Cl. 6 #12-30', detalle: null, barrio: 'Bellavista', lat: 3.87, lng: -77.04 });
  });

  afterEach(() => http.verify());

  it('valida el celular como el backend (10 dígitos que empiezan por 3, o fijo 60x)', () => {
    expect(celularValido('310 555 0142')).toBe(true);
    expect(celularValido('6022401234')).toBe(true);
    expect(celularValido('31055501')).toBe(false);
    expect(celularValido('2105550142')).toBe(false);
  });

  it('nombra el paquete como en el Figma', () => {
    expect(nombrePaquete('pequeno', true)).toBe('Pequeño · Frágil');
    expect(nombrePaquete('mediano', false)).toBe('Mediano');
  });

  it('el mediano va en taxi; sobre y pequeño en moto', () => {
    envio.tamano.set('sobre');
    expect(envio.vehiculo()).toBe('moto');
    envio.tamano.set('mediano');
    expect(envio.vehiculo()).toBe('taxi');
  });

  it('cotiza con la tarifa de encomienda del vehículo que exige el tamaño', async () => {
    envio.tamano.set('mediano');
    const p = envio.cotizar();
    await esperar();
    const req = http.expectOne((r) => r.url.startsWith(API + '/tarifas/cotizar'));
    expect(req.request.url).toContain('tipo_servicio=encomienda');
    expect(req.request.url).toContain('tipo_vehiculo=taxi');
    req.flush({ distancia_km: 5.1, duracion_min: 15, opciones: [{ valor_estimado: '9000' }] });
    await expect(p).resolves.toEqual({ precio: 9000, km: 5.1, min: 15 });
    expect(envio.precio()).toBe(9000);
  });

  it('pide la encomienda con quién recibe, el paquete y quién paga', async () => {
    envio.nombreRecibe.set('Luisa Mosquera');
    envio.celularRecibe.set('310 555 0142');
    envio.contenido.set('Una caja de zapatos con ropa');
    envio.fragil.set(true);
    envio.pagaDestinatario.set(true);
    const p = envio.pedir();
    await esperar();
    const req = http.expectOne(API + '/servicios');
    expect(req.request.body).toMatchObject({
      tipo: 'encomienda',
      tipo_vehiculo: 'moto',
      metodo_pago: 'efectivo',
      nombre_destinatario: 'Luisa Mosquera',
      telefono_destinatario: '310 555 0142',
      descripcion: 'Una caja de zapatos con ropa',
      tipo_paquete: 'pequeno',
      fragil: true,
      paga_destinatario: true,
    });
    req.flush({ id: 7, tarifa: 7000, conductores_notificados: 2, expira_busqueda_en: '', codigo_entrega: '5831' });
    await expect(p).resolves.toMatchObject({ id: 7, codigo_entrega: '5831' });
    expect(envio.pedido()?.codigo_entrega).toBe('5831');
  });
});
