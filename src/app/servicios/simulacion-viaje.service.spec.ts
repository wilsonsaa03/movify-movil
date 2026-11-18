import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { RutaMedida, metros, recorridoEn, rumbo } from '../componentes/mapa-ciudad/animar-por-ruta';
import { girarHacia } from '../componentes/mapa-ciudad/mapa-ciudad.component';
import { EstadoSimulacion, SimulacionViajeService } from './simulacion-viaje.service';

const API = environment.apiUrl;
const esperar = () => new Promise((r) => setTimeout(r, 0));

// "Calles" en el ecuador: 0,001° ≈ 111,32 m. Este → norte → este (dos esquinas).
const CALLE: [number, number][] = [
  [0, 0],
  [0, 0.001],
  [0.001, 0.001],
  [0.001, 0.002],
];
const TRAMO = 111.32;

function estado(parcial: Partial<EstadoSimulacion> = {}): EstadoSimulacion {
  return {
    servicio_id: 7, fase: 'recogida', estado: 'corriendo', version: 1, distancia_m: 3 * TRAMO, recorrido_m: 0,
    restante_m: 3 * TRAMO, eta_s: 30, velocidad_kmh: 36, progreso: 0, lat: 0, lng: 0, rumbo: 90, servidor_ms: 0,
    ruta: CALLE, ...parcial,
  };
}

describe('Motor de ruta (RutaMedida)', () => {
  const ruta = new RutaMedida(CALLE.map(([lat, lng]) => ({ lat, lng })));

  it('mide la polilínea con la misma fórmula del backend', () => {
    expect(ruta.largo).toBeCloseTo(3 * TRAMO, 6);
  });

  it('el vehículo siempre está sobre la calle y dobla en las esquinas (nunca en diagonal)', () => {
    for (let s = 0; s <= ruta.largo; s += 0.5) {
      const p = ruta.en(s).punto;
      // En cada tramo una de las dos coordenadas queda fija: sobre la calle, nunca cortando la esquina
      const enCalle = p.lat === 0 || Math.abs(p.lng - 0.001) < 1e-12 || Math.abs(p.lat - 0.001) < 1e-12;
      expect(enCalle).toBe(true);
    }
    // Pasa exactamente por cada vértice
    for (let i = 0; i < ruta.puntos.length; i++) expect(metros(ruta.en(ruta.acumuladoEn(i)).punto, ruta.puntos[i])).toBeLessThan(0.01);
  });

  it('mira hacia donde va: este, luego norte, luego este', () => {
    expect(ruta.en(50).rumbo).toBeCloseTo(90, 3);
    expect(ruta.en(TRAMO + 50).rumbo).toBeCloseTo(0, 3);
    expect(ruta.en(2 * TRAMO + 50).rumbo).toBeCloseTo(90, 3);
    // En la esquina gira de a poco (entre este y norte)
    const esquina = ruta.en(TRAMO).rumbo;
    expect(esquina).toBeGreaterThan(0);
    expect(esquina).toBeLessThan(90);
    expect(rumbo({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })).toBeCloseTo(180, 6);
  });

  it('lo recorrido llega hasta el vehículo (para pintarlo gris)', () => {
    const hasta = ruta.hasta(TRAMO + 10);
    expect(hasta).toHaveLength(3);
    expect(metros(hasta[2], ruta.en(TRAMO + 10).punto)).toBeLessThan(0.001);
  });

  it('recorridoEn: corre, se pausa, queda lista y no pasa del final', () => {
    expect(recorridoEn('corriendo', 0, 0, 36, 1000, 5000)).toBeCloseTo(50, 9);
    expect(recorridoEn('pausada', 50, 0, 36, 1000, 60000)).toBe(50);
    expect(recorridoEn('lista', 0, 0, 36, 1000, 60000)).toBe(0);
    expect(recorridoEn('corriendo', 0, 0, 36, 1000, 1e9)).toBe(1000);
  });

  it('el rumbo del ícono gira por el lado corto', () => {
    expect(girarHacia(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(girarHacia(10, 350, 0.5)).toBeCloseTo(0, 6);
    expect(girarHacia(90, 180, 1)).toBeCloseTo(180, 6);
  });
});

describe('SimulacionViajeService', () => {
  let sim: SimulacionViajeService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        SimulacionViajeService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NavController, useValue: { navigateRoot: vi.fn() } },
      ],
    });
    sim = TestBed.inject(SimulacionViajeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    sim.detener();
    http.verify();
  });

  it('entre lecturas mueve el vehículo con la velocidad del backend, sobre la ruta', () => {
    sim.aplicar(estado({ recorrido_m: 0, velocidad_kmh: 36 }), 1000);
    const r = sim.recorrido()!;
    expect(r.version).toBe(1);
    // 36 km/h = 10 m/s → a los 5 s lleva 50 m (sobre la primera calle, rumbo este)
    const p = r.posicion(6000);
    expect(p.recorrido).toBeCloseTo(50, 6);
    expect(p.punto.lat).toBe(0);
    expect(p.rumbo).toBeCloseTo(90, 3);
    expect(sim.minutos()).toBe(1);
    expect(sim.restanteKm()).toBeCloseTo((3 * TRAMO) / 1000, 6);
  });

  it('una lectura nueva que no cuadra exacto se suaviza (no salta) y después coincide', () => {
    sim.aplicar(estado({ recorrido_m: 0 }), 0);
    const r = sim.recorrido()!;
    expect(r.posicion(2000).recorrido).toBeCloseTo(20, 6);
    // El backend dice 18 m (el reloj local iba 2 m adelantado)
    sim.aplicar(estado({ recorrido_m: 18 }), 2000);
    expect(sim.recorrido()).toBe(r); // misma ruta: no se rearma
    expect(r.posicion(2000).recorrido).toBeCloseTo(20, 6); // en el instante del cambio no salta
    expect(r.posicion(7000).recorrido).toBeCloseTo(18 + 50, 1); // 5 s después ya coincide con el backend
  });

  it('en pausa no avanza; con ruta nueva (cambio de destino) se rearma', () => {
    sim.aplicar(estado({ estado: 'pausada', recorrido_m: 40 }), 0);
    expect(sim.recorrido()!.posicion(60000).recorrido).toBe(40);
    sim.aplicar(estado({ version: 2, recorrido_m: 0, ruta: [[0, 0], [0.002, 0]] }), 100);
    expect(sim.recorrido()!.version).toBe(2);
    expect(sim.recorrido()!.posicion(100).rumbo).toBeCloseTo(0, 3);
  });

  it('pide la ruta una vez y después solo el estado; 204 = sin simulación', async () => {
    sim.seguir(7);
    http.expectOne(`${API}/servicios/7/simulacion`).flush(estado());
    await esperar();
    expect(sim.activa()).toBe(true);
    expect(sim.ruta()).toHaveLength(4);
    sim.detener();
    sim.seguir(8);
    http.expectOne(`${API}/servicios/8/simulacion?version=1`).flush(null, { status: 204, statusText: 'No Content' });
    await esperar();
    expect(sim.activa()).toBe(false);
    expect(sim.recorrido()).toBeNull();
  });

  it('los controles van al backend y aplican la respuesta', async () => {
    sim.seguir(7);
    http.expectOne(`${API}/servicios/7/simulacion`).flush(estado());
    await esperar();
    const pausa = sim.accion('pausar');
    const req = http.expectOne(`${API}/servicios/7/simulacion/pausar`);
    expect(req.request.method).toBe('POST');
    req.flush(estado({ estado: 'pausada', recorrido_m: 30 }));
    await pausa;
    expect(sim.estado()!.estado).toBe('pausada');
    const vel = sim.velocidad(60);
    const r2 = http.expectOne(`${API}/servicios/7/simulacion/velocidad`);
    expect(r2.request.body).toEqual({ velocidad_kmh: 60 });
    r2.flush(estado({ estado: 'pausada', recorrido_m: 30, velocidad_kmh: 60 }));
    await vel;
    expect(sim.estado()!.velocidad_kmh).toBe(60);
  });
});
