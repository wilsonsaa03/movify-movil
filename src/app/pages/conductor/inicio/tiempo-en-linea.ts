const CLAVE = 'movify.conductor.enLinea';

interface Registro {
  fecha: string; // AAAA-MM-DD del día que se está contando
  acumuladoMs: number; // tiempo de las conexiones que ya terminaron hoy
  desde: number | null; // inicio de la conexión actual (epoch ms) o null si está desconectado
}

/**
 * Cuenta el tiempo en línea de HOY en el celular (el backend todavía no lo guarda).
 * Al cambiar de día empieza de cero; si sigue conectado, cuenta desde la medianoche.
 */
export class TiempoEnLinea {
  conectar(): void {
    const r = this.leer();
    if (r.desde === null) this.guardar({ ...r, desde: Date.now() });
  }

  desconectar(): void {
    const r = this.leer();
    if (r.desde !== null) this.guardar({ ...r, acumuladoMs: r.acumuladoMs + (Date.now() - r.desde), desde: null });
  }

  minutosHoy(): number {
    const r = this.leer();
    const ms = r.acumuladoMs + (r.desde !== null ? Date.now() - r.desde : 0);
    return Math.floor(ms / 60000);
  }

  private leer(): Registro {
    const hoy = TiempoEnLinea.hoy();
    try {
      const r = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Registro | null;
      if (r && r.fecha === hoy) return r;
      // Día nuevo: si quedó conectado desde ayer, cuenta desde la medianoche
      const medianoche = new Date();
      medianoche.setHours(0, 0, 0, 0);
      return { fecha: hoy, acumuladoMs: 0, desde: r?.desde != null ? medianoche.getTime() : null };
    } catch {
      return { fecha: hoy, acumuladoMs: 0, desde: null };
    }
  }

  private guardar(r: Registro): void {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(r));
    } catch {
      /* sin almacenamiento: no se cuenta */
    }
  }

  private static hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
