import { DocumentoConductor, diasParaVencer, estadoDocumento, nivelCancelacion } from './conductor-perfil.service';

const hoy = new Date(2026, 9, 25, 15, 0); // 25 oct 2026, 3 p. m.
const doc = (cambios: Partial<DocumentoConductor>): DocumentoConductor => ({
  id: 1,
  tipo_documento: 'soat',
  nombre: 'SOAT',
  estado: 'aprobado',
  estado_nombre: 'Aprobado',
  observacion: null,
  fecha_vencimiento: null,
  ...cambios,
});

describe('Perfil del conductor', () => {
  it('cuenta los días que faltan sin correrse por la hora', () => {
    expect(diasParaVencer('2026-10-25', hoy)).toBe(0);
    expect(diasParaVencer('2026-11-04', hoy)).toBe(10);
    expect(diasParaVencer('2026-10-20', hoy)).toBe(-5);
    expect(diasParaVencer(null, hoy)).toBeNull();
  });

  it('pide renovar lo vencido y lo que vence en 30 días o menos', () => {
    expect(estadoDocumento(doc({ fecha_vencimiento: '2026-10-20' }), hoy)).toMatchObject({ clase: 'mal', accion: 'renovar' });
    expect(estadoDocumento(doc({ estado: 'vencido' }), hoy)).toMatchObject({ texto: 'Vencido', accion: 'renovar' });
    expect(estadoDocumento(doc({ fecha_vencimiento: '2026-11-04' }), hoy)).toMatchObject({ clase: 'pronto', texto: 'Vence en 10 días', accion: 'renovar' });
    expect(estadoDocumento(doc({ fecha_vencimiento: '2026-10-26' }), hoy).texto).toBe('Vence mañana');
    expect(estadoDocumento(doc({ fecha_vencimiento: '2027-06-01' }), hoy)).toMatchObject({ clase: 'ok', texto: 'Al día', accion: null });
  });

  it('un renovado que está en revisión no vuelve a pedir renovar', () => {
    expect(estadoDocumento(doc({ estado: 'pendiente', fecha_vencimiento: '2027-06-01' }), hoy)).toMatchObject({ clase: 'espera', accion: null });
    expect(estadoDocumento(doc({ estado: 'pendiente', fecha_vencimiento: '2026-11-04' }), hoy).accion).toBeNull();
  });

  it('un rechazado muestra el motivo y pide corregir', () => {
    expect(estadoDocumento(doc({ estado: 'rechazado', observacion: 'La foto está borrosa' }), hoy)).toMatchObject({
      clase: 'mal',
      detalle: 'La foto está borrosa',
      accion: 'corregir',
    });
  });

  it('la tasa de cancelación se pinta según el límite', () => {
    expect(nivelCancelacion(4, 20)).toBe('bien');
    expect(nivelCancelacion(15, 20)).toBe('cuidado');
    expect(nivelCancelacion(20.5, 20)).toBe('mal');
  });
});
