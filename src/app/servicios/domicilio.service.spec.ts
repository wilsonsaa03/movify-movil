import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { DomicilioService, iconoPedido, tituloPedido } from './domicilio.service';

const API = environment.apiUrl;

/** Deja que corran las promesas pendientes antes de mirar las peticiones. */
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('DomicilioService', () => {
  let pedido: DomicilioService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NavController, useValue: { navigateRoot: vi.fn() } }],
    });
    pedido = TestBed.inject(DomicilioService);
    http = TestBed.inject(HttpTestingController);
    pedido.tienda.set({ nombre: 'Droguería La Económica', detalle: 'Cl. 2 #3-15', barrio: 'Centro', lat: 3.89, lng: -77.07 });
    pedido.entrega.set({ nombre: 'Mi ubicación', detalle: 'Cra 3 #5-20', barrio: 'La Playita', lat: 3.88, lng: -77.03 });
  });

  afterEach(() => http.verify());

  it('nombra e ilustra el pedido según "¿Qué es?"', () => {
    expect(tituloPedido('farmacia')).toBe('Farmacia');
    expect(tituloPedido(null)).toBe('Domicilio');
    expect(iconoPedido('mercado')).toBe('mercado');
    expect(iconoPedido(undefined)).toBe('domicilio');
  });

  it('el total suma el pedido solo si lo paga el domiciliario', () => {
    pedido.tarifa.set(5000);
    pedido.valorPedido.set(28000);
    expect(pedido.total()).toBe(5000);
    pedido.pagaDomiciliario.set(true);
    expect(pedido.total()).toBe(33000);
  });

  it('cotiza con la tarifa de domicilio en moto', async () => {
    const p = pedido.cotizar();
    await esperar();
    const req = http.expectOne((r) => r.url.startsWith(API + '/tarifas/cotizar'));
    expect(req.request.url).toContain('tipo_servicio=domicilio');
    expect(req.request.url).toContain('tipo_vehiculo=moto');
    req.flush({ distancia_km: 4.2, duracion_min: 15, opciones: [{ valor_estimado: '5000' }] });
    await expect(p).resolves.toEqual({ precio: 5000, km: 4.2, min: 15 });
  });

  it('pide el domicilio con la tienda, la categoría y quién paga', async () => {
    pedido.categoria.set('farmacia');
    pedido.descripcion.set('  Acetaminofén 500 mg y suero oral  ');
    pedido.pagaDomiciliario.set(true);
    pedido.valorPedido.set(28000);
    const p = pedido.pedir();
    await esperar();
    const req = http.expectOne(API + '/servicios');
    expect(req.request.body).toMatchObject({
      tipo: 'domicilio',
      tipo_vehiculo: 'moto',
      metodo_pago: 'efectivo',
      establecimiento: 'Droguería La Económica',
      categoria: 'farmacia',
      descripcion: 'Acetaminofén 500 mg y suero oral',
      requiere_compra: true,
      valor_productos_aprox: 28000,
      destino_lat: 3.88,
    });
    req.flush({ id: 9, tarifa: 5000, conductores_notificados: 5, expira_busqueda_en: '' });
    await expect(p).resolves.toMatchObject({ id: 9 });
  });

  it('si ya está pago no manda valor del pedido', async () => {
    pedido.descripcion.set('Recoger un almuerzo pagado');
    pedido.valorPedido.set(15000);
    const p = pedido.pedir();
    await esperar();
    const req = http.expectOne(API + '/servicios');
    expect(req.request.body).toMatchObject({ requiere_compra: false, valor_productos_aprox: null });
    req.flush({ id: 10, tarifa: 5000, conductores_notificados: 1, expira_busqueda_en: '' });
    await p;
  });
});
