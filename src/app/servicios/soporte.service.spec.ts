import { TIPOS_SOLICITUD, nombreTipo, numeroSolicitud } from './soporte.service';

describe('soporte (Ayuda)', () => {
  it('ofrece los 7 tipos que acepta POST /api/pqrs, sin repetir', () => {
    const ids = TIPOS_SOLICITUD.map((t) => t.id);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual(
      expect.arrayContaining(['peticion', 'queja', 'reclamo', 'sugerencia', 'objeto_olvidado', 'cobro_indebido', 'incidente_seguridad']),
    );
  });

  it('nombra cada tipo con palabras del día a día', () => {
    expect(nombreTipo('objeto_olvidado')).toBe('Olvidé algo');
    expect(nombreTipo('cobro_indebido')).toBe('Me cobraron mal');
  });

  it('arma el número de la solicitud', () => {
    expect(numeroSolicitud(42)).toBe('MV-0042');
    expect(numeroSolicitud(12345)).toBe('MV-12345');
  });
});
