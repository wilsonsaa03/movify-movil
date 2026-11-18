import { caminoPorRuta, largo, metros, proyectar, puntoEn } from './animar-por-ruta';

// Ruta en "L" por calles de Buenaventura: hacia el este ~220 m y luego hacia el norte ~220 m
const A = { lat: 3.88, lng: -77.032 };
const B = { lat: 3.88, lng: -77.03 }; // la esquina
const C = { lat: 3.882, lng: -77.03 };
const RUTA = [A, B, C];

describe('vehículo que avanza por la ruta', () => {
  it('se pega a la ruta y dobla en la esquina en vez de cortar en diagonal', () => {
    const desde = { lat: 3.88001, lng: -77.031 }; // en el primer tramo
    const hasta = { lat: 3.881, lng: -77.03001 }; // en el segundo tramo
    const camino = caminoPorRuta(desde, hasta, RUTA);
    expect(camino).toContainEqual(B);
    expect(largo(camino)).toBeGreaterThan(metros(desde, hasta)); // más largo que la línea recta
  });

  it('si se salió de la ruta va en línea recta', () => {
    const lejos = { lat: 3.885, lng: -77.04 };
    expect(caminoPorRuta(A, lejos, RUTA)).toEqual([A, lejos]);
  });

  it('también sirve en reversa (si se devolvió por la misma calle)', () => {
    const camino = caminoPorRuta(C, A, RUTA);
    expect(camino[0]).toEqual(C);
    expect(camino).toContainEqual(B);
    expect(camino[camino.length - 1]).toEqual(A);
  });

  it('la mitad del camino cae sobre la ruta', () => {
    const medio = puntoEn([A, B, C], 0.5);
    expect(proyectar(medio, RUTA).distancia).toBeLessThan(1);
    expect(metros(medio, B)).toBeLessThan(5); // los dos tramos miden casi lo mismo: la mitad es la esquina
  });
});
