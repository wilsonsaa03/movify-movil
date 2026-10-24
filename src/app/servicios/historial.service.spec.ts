import { claseEstado, dia, fechaHora, iconoServicio, nombreServicio, seguimiento } from './historial.service';

describe('historial (Mis pedidos)', () => {
  const hoy = new Date(2026, 9, 24, 10, 0); // sáb 24 oct 2026

  it('agrupa por día: Hoy, Ayer o la fecha', () => {
    expect(dia(new Date(2026, 9, 24, 7, 30).toISOString(), hoy)).toBe('Hoy');
    expect(dia(new Date(2026, 9, 23, 21, 0).toISOString(), hoy)).toBe('Ayer');
    expect(dia(new Date(2026, 9, 20, 9, 0).toISOString(), hoy)).toMatch(/20/);
    expect(dia(new Date(2025, 11, 31, 9, 0).toISOString(), hoy)).toMatch(/2025/);
  });

  it('muestra la fecha con la hora', () => {
    const texto = fechaHora(new Date(2026, 9, 23, 18, 48).toISOString());
    expect(texto).toContain('23');
    expect(texto).toContain('·');
    expect(fechaHora(null)).toBe('');
  });

  it('nombra el servicio y elige su ícono', () => {
    expect(nombreServicio({ tipo_servicio: 'transporte', tipo_vehiculo: 'taxi' })).toBe('Viaje en taxi');
    expect(nombreServicio({ tipo_servicio: 'domicilio', tipo_vehiculo: 'moto' })).toBe('Domicilio');
    expect(iconoServicio({ tipo_servicio: 'encomienda', tipo_vehiculo: 'moto' })).toBe('encomienda');
  });

  it('colorea el estado final', () => {
    expect(claseEstado('finalizado')).toBe('ok');
    expect(claseEstado('cancelado')).toBe('mal');
    expect(claseEstado('expirado')).toBe('mal');
    expect(claseEstado('en_curso')).toBe('curso');
  });

  it('un pedido en curso abre su seguimiento; uno cerrado, el detalle', () => {
    expect(seguimiento({ tipo_servicio: 'domicilio', estado_codigo: 'asignado' })).toBe('/cliente/domicilio/seguimiento');
    expect(seguimiento({ tipo_servicio: 'transporte', estado_codigo: 'en_curso' })).toBe('/cliente/viaje/en-camino');
    expect(seguimiento({ tipo_servicio: 'encomienda', estado_codigo: 'buscando' })).toBe('/cliente/viaje/buscando');
    expect(seguimiento({ tipo_servicio: 'transporte', estado_codigo: 'finalizado' })).toBeNull();
  });
});
