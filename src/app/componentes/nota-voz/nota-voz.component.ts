import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, input, output, signal } from '@angular/core';
import { IconoComponent } from '../icono/icono.component';

/** Alturas de las barras de la "onda" (decorativas, siempre iguales para que no salten). */
const ONDA = [10, 18, 26, 14, 30, 22, 12, 28, 34, 20, 16, 26, 12, 22, 30, 18, 10, 24, 14, 20];

/**
 * Reproductor de la nota de voz del punto de referencia (como en el Figma: ▶ onda 0:08 ✕).
 *   <app-nota-voz [fuente]="url" [segundos]="8" [quitable]="true" (quitar)="borrar()" />
 * `fuente` puede llegar después (p. ej. mientras se descarga del backend): el botón queda en espera.
 */
@Component({
  selector: 'app-nota-voz',
  imports: [IconoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nota" [class.sonando]="sonando()">
      <button type="button" class="play" [disabled]="!fuente()" [attr.aria-label]="sonando() ? 'Pausar nota de voz' : 'Escuchar nota de voz'" (click)="alternar()">
        @if (!fuente()) {
          <span class="cargando" aria-hidden="true"></span>
        } @else {
          <app-icono [nombre]="sonando() ? 'pausa' : 'play'" />
        }
      </button>
      <span class="onda" aria-hidden="true">
        @for (h of onda; track $index) {
          <i [style.height.px]="h" [class.pasada]="$index / onda.length < avance()"></i>
        }
      </span>
      <span class="tiempo">{{ tiempo() }}</span>
      @if (quitable()) {
        <button type="button" class="quitar" aria-label="Borrar nota de voz" (click)="detener(); quitar.emit()">
          <app-icono nombre="x" />
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .nota {
      display: flex; align-items: center; gap: 12px; padding: 8px 12px 8px 8px;
      border: 2px solid #b8e7ea; border-radius: 18px; background: #e8f8f9;
    }
    .play {
      width: 42px; height: 42px; flex-shrink: 0; border: 0; border-radius: 50%; display: grid; place-items: center;
      background: #007c85; color: #ffffff; cursor: pointer; transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
    }
    .play:active { transform: scale(0.92); }
    .play:disabled { opacity: 0.7; cursor: progress; }
    .play app-icono { width: 18px; height: 18px; --relleno: currentColor; }
    .onda { flex: 1; min-width: 0; height: 36px; display: flex; align-items: center; gap: 3px; overflow: hidden; }
    .onda i { flex-shrink: 0; width: 3px; border-radius: 2px; background: #03274d; opacity: 0.85; transition: background-color 120ms; }
    .onda i.pasada { background: #02aab4; opacity: 1; }
    .tiempo { font: 800 14px 'Nunito', system-ui, sans-serif; color: #007c85; font-variant-numeric: tabular-nums; }
    .quitar { width: 32px; height: 32px; border: 0; border-radius: 50%; display: grid; place-items: center; background: none; color: #5b6b80; cursor: pointer; }
    .quitar app-icono { width: 18px; height: 18px; }
    .cargando { width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid #ffffff; border-right-color: transparent; animation: girar 700ms linear infinite; }
    @keyframes girar { to { transform: rotate(360deg); } }
  `,
})
export class NotaVozComponent implements OnDestroy {
  readonly fuente = input<string | null>(null);
  readonly segundos = input(0);
  readonly quitable = input(false);
  readonly quitar = output<void>();

  readonly onda = ONDA;
  readonly sonando = signal(false);
  readonly actual = signal(0);
  readonly avance = computed(() => (this.segundos() ? Math.min(1, this.actual() / this.segundos()) : 0));
  /** Mientras suena muestra lo que lleva; quieta, la duración total. */
  readonly tiempo = computed(() => formatear(this.sonando() || this.actual() ? this.actual() : this.segundos()));

  private audio?: HTMLAudioElement;

  constructor() {
    // Si cambia la nota, se suelta la anterior
    effect(() => {
      this.fuente();
      this.detener();
      this.audio = undefined;
    });
  }

  alternar(): void {
    const src = this.fuente();
    if (!src) return;
    if (!this.audio) {
      this.audio = new Audio(src);
      this.audio.ontimeupdate = () => this.actual.set(this.audio!.currentTime);
      this.audio.onended = () => {
        this.sonando.set(false);
        this.actual.set(0);
      };
    }
    if (this.sonando()) {
      this.audio.pause();
      this.sonando.set(false);
    } else {
      this.audio.play().then(() => this.sonando.set(true)).catch(() => this.sonando.set(false));
    }
  }

  detener(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.sonando.set(false);
    this.actual.set(0);
  }

  ngOnDestroy(): void {
    this.detener();
  }
}

export function formatear(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
