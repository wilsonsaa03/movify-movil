import { Component, ElementRef, HostListener, inject, input, output } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Teclado numérico grande (código SMS y clave).
 * También funciona con el teclado físico del computador (números y Borrar).
 */
@Component({
  selector: 'app-teclado-numerico',
  template: `
    <div class="teclado" [class.bloqueado]="deshabilitado()" role="group" aria-label="Teclado numérico">
      @for (n of numeros; track n) {
        <button type="button" class="tecla" [disabled]="deshabilitado()" (click)="pulsar(n)">{{ n }}</button>
      }
      <span class="vacio" aria-hidden="true"></span>
      <button type="button" class="tecla" [disabled]="deshabilitado()" (click)="pulsar('0')">0</button>
      <button type="button" class="tecla borrar" aria-label="Borrar" [disabled]="deshabilitado()" (click)="quitar()">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 5H9l-6 7 6 7h12V5z" /><path d="M17 9.5l-5 5M12 9.5l5 5" />
        </svg>
      </button>
    </div>
  `,
  styles: `
    .teclado { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .tecla {
      height: 58px; border: 0; border-radius: 18px; background: #eef3f8;
      font-family: 'Nunito', system-ui, sans-serif; font-size: 24px; font-weight: 800; color: #03274d;
      display: grid; place-items: center; cursor: pointer;
      box-shadow: 0 2px 0 #d5dee8;
      transition: transform 100ms cubic-bezier(0.23, 1, 0.32, 1), background-color 100ms ease, box-shadow 100ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    .tecla:active { transform: translateY(2px) scale(0.97); background: #dfe8f1; box-shadow: 0 0 0 #d5dee8; }
    .tecla:focus-visible { outline: 3px solid #02aab4; outline-offset: 2px; }
    .tecla:disabled { opacity: 0.5; }
    .borrar svg { width: 28px; height: 28px; fill: none; stroke: #03274d; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  `,
})
export class TecladoNumericoComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly deshabilitado = input(false);
  readonly digito = output<string>();
  readonly borrar = output<void>();

  readonly numeros = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  pulsar(n: string): void {
    if (this.deshabilitado()) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.digito.emit(n);
  }

  quitar(): void {
    if (this.deshabilitado()) return;
    this.borrar.emit();
  }

  /** Teclado físico (útil al probar con "ionic serve" en el computador). */
  @HostListener('window:keydown', ['$event'])
  alTeclado(e: KeyboardEvent): void {
    const enCampo = (e.target as HTMLElement | null)?.closest('input, textarea, select');
    // Ionic deja las pantallas anteriores ocultas en memoria: solo responde la que se ve
    const oculta = this.host.nativeElement.closest('.ion-page-hidden, [aria-hidden="true"]');
    if (enCampo || oculta || this.deshabilitado()) return;
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      this.digito.emit(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      this.borrar.emit();
    }
  }
}
