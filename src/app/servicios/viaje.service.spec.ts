import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { ViajeService } from './viaje.service';

const API = environment.apiUrl;
const esperar = () => new Promise((r) => setTimeout(r, 0));
const CASA = { nombre: 'Mi ubicación', detalle: 'Cl. 6 #3-20', barrio: 'Centro', lat: 3.88, lng: -77.03 };
const MUELLE = { nombre: 'Muelle turístico', detalle: null, barrio: 'Centro', lat: 3.89, lng: -77.07 };
const DROGUERIA = { nombre: 'Droguería', detalle: null, barrio: null, lat: 3.885, lng: -77.05 };

describe('ViajeService (pedir moto o taxi)', () => {
  let viaje: ViajeService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NavController, useValue: { navigateRoot: vi.fn() } }],
    });
    viaje = TestBed.inject(ViajeService);
    http = TestBed.inject(HttpTestingController);
    viaje.origen.set(CASA);
    viaje.destino.set(MUELLE);
  });

  afterEach(() => http.verify());

  it('pide un taxi para otra persona con parada, equipaje y lo que ofrece de más', async () => {
    viaje.tipo.set('taxi');
    viaje.pasajeros.set(3);
    viaje.equipaje.set(true);
    viaje.casco.set(true); // en taxi no aplica: no se manda
    viaje.parada.set(DROGUERIA);
    viaje.paraOtro.set({ nombre: 'Abuela Rosa', telefono: '3105556677' });
    viaje.ofrecido.set(12000);
    const p = viaje.pedir();
    await esperar();
    const req = http.expectOne(API + '/servicios');
    expect(req.request.body).toMatchObject({
      tipo_vehiculo: 'taxi',
      pasajeros: 3,
      necesita_casco: false,
      lleva_equipaje: true,
      lleva_mascota: false,
      pasajero_nombre: 'Abuela Rosa',
      pasajero_telefono: '3105556677',
      parada: 'Droguería',
      parada_lat: 3.885,
      parada_lng: -77.05,
      valor_ofrecido: 12000,
      metodo_pago: 'efectivo',
    });
    req.flush({ id: 5, tarifa: 12000, conductores_notificados: 2, expira_busqueda_en: '' });
    expect((await p).id).toBe(5);
  });

  it('en moto siempre va 1 pasajero y manda si necesita casco', async () => {
    viaje.tipo.set('moto');
    viaje.pasajeros.set(3);
    viaje.casco.set(true);
    const p = viaje.pedir();
    await esperar();
    const req = http.expectOne(API + '/servicios');
    expect(req.request.body).toMatchObject({ pasajeros: 1, necesita_casco: true, lleva_equipaje: false, parada_lat: null });
    req.flush({ id: 6, tarifa: 5000, conductores_notificados: 1, expira_busqueda_en: '' });
    await p;
  });

  it('cotiza pasando por la parada y entiende el recargo nocturno', async () => {
    viaje.parada.set(DROGUERIA);
    const p = viaje.cotizar();
    await esperar();
    const req = http.expectOne((r) => r.url.startsWith(API + '/tarifas/cotizar') && r.url.includes('parada_lat=3.885'));
    req.flush({ distancia_km: '4.2', duracion_min: 12, nocturno: true, opciones: [{ tipo_vehiculo: 'moto', valor_estimado: '7800', recargo_nocturno_pct: '10', valor_maximo: '15600' }] });
    const c = await p;
    expect(c.nocturno).toBe(true);
    expect(c.opciones[0]).toEqual({ tipo_vehiculo: 'moto', valor_estimado: 7800, recargo_nocturno_pct: 10, valor_maximo: 15600 });
  });

  it('cancela con el motivo elegido y sube la tarifa sin cancelar', async () => {
    const c = viaje.cancelar(8, 2);
    await esperar();
    const r1 = http.expectOne(API + '/servicios/8/estado');
    expect(r1.request.body).toEqual({ estado: 'cancelado', motivo_id: 2 });
    r1.flush({});
    await c;

    const s = viaje.subirTarifa(8, 9000);
    await esperar();
    const r2 = http.expectOne(API + '/servicios/8/tarifa');
    expect(r2.request.body).toEqual({ valor: 9000 });
    r2.flush({ tarifa: 9000, expira_busqueda_en: '', conductores_notificados: 3, message: 'ok' });
    expect((await s).tarifa).toBe(9000);
  });

  it('olvidar limpia el borrador pero conserva si necesita casco', () => {
    viaje.casco.set(true);
    viaje.parada.set(DROGUERIA);
    viaje.paraOtro.set({ nombre: 'Rosa', telefono: '3105556677' });
    viaje.ofrecido.set(9000);
    viaje.olvidar();
    expect(viaje.destino()).toBeNull();
    expect(viaje.parada()).toBeNull();
    expect(viaje.paraOtro()).toBeNull();
    expect(viaje.ofrecido()).toBeNull();
    expect(viaje.casco()).toBe(true);
  });
});
