import { compararVersiones, estadoVersion } from './version-app';

describe('versión mínima de la app', () => {
  it('compara número por número, no como texto', () => {
    expect(compararVersiones('1.10.0', '1.9.3')).toBe(1);
    expect(compararVersiones('1.2', '1.2.0')).toBe(0);
    expect(compararVersiones('0.9.9', '1.0.0')).toBe(-1);
  });

  it('obliga a actualizar solo si está por debajo de la mínima', () => {
    expect(estadoVersion('1.0.0', '1.1.0', '1.2.0')).toBe('obligatoria');
    expect(estadoVersion('1.1.0', '1.1.0', '1.2.0')).toBe('sugerida');
    expect(estadoVersion('1.2.0', '1.1.0', '1.2.0')).toBe('al-dia');
  });
});
