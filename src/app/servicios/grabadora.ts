import { NotaVoz } from './viaje.service';

/** Tope de la nota de voz (el backend acepta hasta 60 s y 2 MB). */
export const MAX_SEGUNDOS_NOTA = 30;

/** Formatos en orden de preferencia: opus/webm (Android, Chrome), mp4 (iPhone), ogg (Firefox). */
const FORMATOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/**
 * Graba una nota de voz con el micrófono (MediaRecorder).
 *   const g = new Grabadora();  await g.empezar();  …  const nota = await g.terminar();
 * Se detiene sola al llegar a MAX_SEGUNDOS_NOTA (`alTerminarSola`).
 */
export class Grabadora {
  private grabador?: MediaRecorder;
  private flujo?: MediaStream;
  private trozos: Blob[] = [];
  private inicio = 0;
  private tope?: ReturnType<typeof setTimeout>;
  private resolver?: (n: NotaVoz | null) => void;

  /** Se llama si la grabación se corta sola por llegar al tope. */
  alTerminarSola?: (n: NotaVoz | null) => void;

  static disponible(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Pide el micrófono y empieza. Lanza Error con un mensaje para mostrar si no se puede. */
  async empezar(): Promise<void> {
    if (!Grabadora.disponible()) throw new Error('Tu celular no permite grabar notas de voz aquí.');
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new Error('Permite el micrófono para grabar la nota de voz.');
    }
    const mimeType = FORMATOS.find((f) => MediaRecorder.isTypeSupported(f));
    this.grabador = new MediaRecorder(this.flujo, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    this.trozos = [];
    this.grabador.ondataavailable = (e) => e.data.size && this.trozos.push(e.data);
    this.grabador.onstop = () => this.cerrar();
    this.grabador.start(250);
    this.inicio = Date.now();
    this.tope = setTimeout(() => {
      this.terminar().then((n) => this.alTerminarSola?.(n));
    }, MAX_SEGUNDOS_NOTA * 1000);
  }

  /** Segundos grabados hasta ahora. */
  segundos(): number {
    return this.inicio ? Math.min(MAX_SEGUNDOS_NOTA, (Date.now() - this.inicio) / 1000) : 0;
  }

  /** Detiene y entrega la nota (null si quedó vacía o duró menos de 1 s). */
  terminar(): Promise<NotaVoz | null> {
    if (!this.grabador || this.grabador.state === 'inactive') return Promise.resolve(null);
    return new Promise((ok) => {
      this.resolver = ok;
      this.grabador!.stop();
    });
  }

  /** Cancela sin guardar (al salir de la pantalla). */
  descartar(): void {
    this.resolver = undefined;
    if (this.grabador && this.grabador.state !== 'inactive') this.grabador.stop();
    else this.soltarMicrofono();
  }

  private cerrar(): void {
    clearTimeout(this.tope);
    const segundos = Math.max(1, Math.round((Date.now() - this.inicio) / 1000));
    const duro = (Date.now() - this.inicio) / 1000;
    this.soltarMicrofono();
    const tipo = this.grabador?.mimeType || this.trozos[0]?.type || 'audio/webm';
    const blob = new Blob(this.trozos, { type: tipo.split(';')[0] });
    // Si se descartó (nadie espera la nota) no se crea la URL: quedaría ocupando memoria
    const sirve = this.resolver && blob.size > 0 && duro >= 1;
    const nota = sirve ? { blob, url: URL.createObjectURL(blob), segundos: Math.min(segundos, MAX_SEGUNDOS_NOTA) } : null;
    this.resolver?.(nota);
    this.resolver = undefined;
    this.inicio = 0;
  }

  /** Apaga el micrófono (si no, el celular sigue mostrando que está grabando). */
  private soltarMicrofono(): void {
    this.flujo?.getTracks().forEach((t) => t.stop());
    this.flujo = undefined;
  }
}
