import { VigilanciaViaje, distanciaARuta } from './vigilancia-viaje';

// Ruta recta hacia el norte en Buenaventura (≈ 2,2 km)
const RUTA = [
  { lat: 3.88, lng: -77.03 },
  { lat: 3.89, lng: -77.03 },
  { lat: 3.9, lng: -77.03 },
];
const DESTINO = { lat: 3.9, lng: -77.03 };
const MIN = 60_000;

describe('VigilanciaViaje (¿Todo bien?)', () => {
  it('mide la distancia a la ruta, no solo a sus puntos', () => {
    // A mitad de un tramo, sobre la línea: casi 0 aunque esté lejos de los vértices
    expect(distanciaARuta({ lat: 3.885, lng: -77.03 }, RUTA)).toBeLessThan(0.01);
    // ≈ 1,1 km al este de la ruta
    expect(distanciaARuta({ lat: 3.885, lng: -77.02 }, RUTA)).toBeGreaterThan(1);
  });

  it('pregunta por desvío solo después de varias lecturas seguidas fuera de la ruta', () => {
    const v = new VigilanciaViaje(RUTA, [DESTINO]);
    const lejos = { lat: 3.885, lng: -77.02 };
    expect(v.registrar(lejos, 0)).toBeNull();
    expect(v.registrar({ ...lejos, lat: 3.886 }, 6000)).toBeNull();
    expect(v.registrar({ ...lejos, lat: 3.887 }, 12000)).toBe('desvio');
    // No vuelve a preguntar enseguida
    expect(v.registrar({ ...lejos, lat: 3.888 }, 18000)).toBeNull();
  });

  it('un salto aislado del GPS no cuenta como desvío', () => {
    const v = new VigilanciaViaje(RUTA, [DESTINO]);
    expect(v.registrar({ lat: 3.885, lng: -77.02 }, 0)).toBeNull();
    expect(v.registrar({ lat: 3.886, lng: -77.03 }, 6000)).toBeNull();
    expect(v.registrar({ lat: 3.887, lng: -77.02 }, 12000)).toBeNull();
    expect(v.registrar({ lat: 3.888, lng: -77.02 }, 18000)).toBeNull();
  });

  it('pregunta por parada larga si el vehículo no se mueve varios minutos', () => {
    const v = new VigilanciaViaje(RUTA, [DESTINO]);
    const p = { lat: 3.885, lng: -77.03 };
    expect(v.registrar(p, 0)).toBeNull();
    expect(v.registrar(p, 2 * MIN)).toBeNull();
    expect(v.registrar(p, 4 * MIN)).toBe('detenido');
  });

  it('detenerse cerca del destino es normal', () => {
    const v = new VigilanciaViaje(RUTA, [DESTINO]);
    const cerca = { lat: 3.8995, lng: -77.03 };
    expect(v.registrar(cerca, 0)).toBeNull();
    expect(v.registrar(cerca, 10 * MIN)).toBeNull();
  });
});
