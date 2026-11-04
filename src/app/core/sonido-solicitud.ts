/**
 * Timbre de "nueva solicitud" para el conductor con la app abierta: tres toques ascendentes, fuerte y claro
 * (en la calle solo con la vibración no se entera). Se genera con Web Audio: no hace falta un archivo de sonido.
 * Con la app en segundo plano suena la notificación local del sistema (ConductorEnLineaService).
 */
let contexto: AudioContext | null = null;

export function sonarSolicitud(): void {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    contexto ??= new Ctor();
    const ctx = contexto;
    ctx.resume().catch(() => undefined);
    const inicio = ctx.currentTime + 0.05;
    // Dos veces la frase do-mi-sol (523, 659, 784 Hz)
    [523, 659, 784, 523, 659, 784].forEach((hz, i) => {
      const t = inicio + i * 0.16 + (i >= 3 ? 0.25 : 0);
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = hz;
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  } catch {
    // sin audio (navegador sin Web Audio): queda la vibración
  }
}
