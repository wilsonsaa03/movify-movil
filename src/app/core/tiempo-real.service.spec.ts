import { TestBed } from '@angular/core/testing';
import { SesionService } from './sesion.service';
import { EventoTiempoReal, TiempoRealService, urlTiempoReal } from './tiempo-real.service';

/** WebSocket falso: guarda lo que la app manda y deja simular lo que llega del backend. */
class WsFalso {
  static OPEN = 1;
  static ultimo: WsFalso | null = null;
  readyState = 0;
  enviados: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    WsFalso.ultimo = this;
  }
  send(t: string): void {
    this.enviados.push(JSON.parse(t));
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  abrir(): void {
    this.readyState = WsFalso.OPEN;
    this.onopen?.();
  }
  llega(d: unknown): void {
    this.onmessage?.({ data: JSON.stringify(d) });
  }
}

describe('TiempoRealService', () => {
  const original = globalThis.WebSocket;
  let tr: TiempoRealService;

  beforeEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = WsFalso;
    WsFalso.ultimo = null;
    TestBed.configureTestingModule({});
    TestBed.inject(SesionService).datos.set({ token: 'jwt-de-prueba' } as never);
    tr = TestBed.inject(TiempoRealService);
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = original;
  });

  it('arma la URL ws/wss a partir de la URL de la API', () => {
    expect(urlTiempoReal('http://192.168.1.5:8080/api')).toBe('ws://192.168.1.5:8080/ws/tiempo-real');
    expect(urlTiempoReal('https://movify.ejemplo.co/api')).toBe('wss://movify.ejemplo.co/ws/tiempo-real');
  });

  it('manda el token en el primer mensaje (no en la URL) y sigue el servicio cuando el backend acepta', () => {
    const recibidos: EventoTiempoReal[] = [];
    const dejar = tr.seguir(12, (e) => recibidos.push(e));
    const ws = WsFalso.ultimo!;
    expect(ws.url).not.toContain('jwt');
    ws.abrir();
    expect(ws.enviados[0]).toEqual({ tipo: 'auth', token: 'jwt-de-prueba' });
    ws.llega({ tipo: 'listo', usuario: 7 });
    expect(tr.conectado()).toBe(true);
    expect(ws.enviados).toContainEqual({ tipo: 'seguir', servicio: 12 });

    ws.llega({ tipo: 'mensaje', servicio: 12, contenido: 'Ya llegué' });
    ws.llega({ tipo: 'mensaje', servicio: 99, contenido: 'otro servicio' });
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]['contenido']).toBe('Ya llegué');

    // Al salir de la pantalla deja de seguirlo y, sin nada más que seguir, cierra la conexión
    dejar();
    expect(ws.enviados).toContainEqual({ tipo: 'dejar', servicio: 12 });
    expect(tr.conectado()).toBe(false);
  });

  it('sin sesión no se conecta', () => {
    TestBed.inject(SesionService).datos.set(null);
    tr.seguir(5, () => undefined);
    expect(WsFalso.ultimo).toBeNull();
  });
});
