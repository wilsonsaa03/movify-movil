import { appNavegacion, guardarAppNavegacion, navegarA, urlNavegacion } from './navegacion';

describe('Navegación con Google Maps o Waze', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('arma el enlace de cada app con el punto de llegada', () => {
    expect(urlNavegacion('google', 3.8801, -77.0312)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=3.880100,-77.031200&travelmode=driving',
    );
    expect(urlNavegacion('waze', 3.8801, -77.0312)).toBe('https://waze.com/ul?ll=3.880100,-77.031200&navigate=yes');
  });

  it('recuerda la app elegida y abre con ella', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    guardarAppNavegacion('waze');
    expect(appNavegacion()).toBe('waze');
    expect(localStorage.getItem('movify.app_navegacion')).toBe('waze');
    expect(navegarA(3.88, -77.03)).toBe(true);
    expect(abrir.mock.calls[0][0]).toContain('waze.com');
    guardarAppNavegacion('google');
  });

  it('sin coordenadas no abre nada', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(navegarA(null, -77)).toBe(false);
    expect(abrir).not.toHaveBeenCalled();
  });
});
