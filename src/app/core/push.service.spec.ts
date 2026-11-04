import { rutaDelAviso } from './push.service';

describe('rutaDelAviso (a dónde lleva cada notificación)', () => {
  it('los comunicados del admin abren la bandeja de notificaciones de cada rol', () => {
    expect(rutaDelAviso({ evento: 'comunicado', comunicado_id: '3' } as any, true)).toEqual({ ruta: '/conductor/notificaciones' });
    expect(rutaDelAviso({ evento: 'comunicado', comunicado_id: '3' } as any, false)).toEqual({ ruta: '/cliente/notificaciones' });
  });

  it('al conductor: solicitud y chat a su pantalla; lo demás a su inicio', () => {
    expect(rutaDelAviso({ evento: 'solicitud', servicio_id: '7' }, true)).toEqual({ ruta: '/conductor/viaje/solicitud', params: { id: 7 } });
    expect(rutaDelAviso({ evento: 'mensaje', servicio_id: '7' }, true)).toEqual({ ruta: '/conductor/viaje/chat', params: { id: 7 } });
    expect(rutaDelAviso({ evento: 'cancelado', servicio_id: '7' }, true)).toEqual({ ruta: '/conductor/inicio' });
  });

  it('al pasajero: chat, calificar al terminar y el seguimiento en lo demás', () => {
    expect(rutaDelAviso({ evento: 'mensaje', servicio_id: '9' }, false)).toEqual({ ruta: '/cliente/viaje/chat', params: { id: 9 } });
    expect(rutaDelAviso({ evento: 'finalizado', servicio_id: '9' }, false)).toEqual({ ruta: '/cliente/viaje/calificar', params: { id: 9 } });
    expect(rutaDelAviso({ evento: 'en_origen', servicio_id: '9' }, false)).toEqual({ ruta: '/cliente/viaje/buscando', params: { id: 9 } });
    expect(rutaDelAviso({ evento: 'programado' }, false)).toEqual({ ruta: '/cliente/pedidos' });
    // Soporte respondió una PQRS (aunque venga ligada a un viaje, se abre Ayuda)
    expect(rutaDelAviso({ evento: 'soporte', servicio_id: '9' }, false)).toEqual({ ruta: '/cliente/ayuda' });
    expect(rutaDelAviso(null, false)).toEqual({ ruta: '/cliente' });
  });
});
