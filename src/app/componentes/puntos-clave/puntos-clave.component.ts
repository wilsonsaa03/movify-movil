import { Component, computed, input } from '@angular/core';

/** Los 4 puntos de la clave: vacíos → llenos a medida que se escribe. */
@Component({
  selector: 'app-puntos-clave',
  template: `
    <div class="puntos" [class.sacudir]="sacudir()" [class.con-error]="error()" role="img" [attr.aria-label]="cantidad() + ' de ' + largo() + ' dígitos'">
      @for (p of lista(); track $index) {
        <span class="punto" [class.lleno]="$index < cantidad()"></span>
      }
    </div>
  `,
  styles: `
    .puntos { display: flex; justify-content: center; gap: 22px; }
    .punto {
      width: 20px; height: 20px; border-radius: 50%;
      border: 3px solid #c3cfdc; background: transparent;
      transition: background-color 120ms ease, border-color 120ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
    }
    .punto.lleno { background: #03274d; border-color: #03274d; transform: scale(1.1); }
    .con-error .punto.lleno { background: #d92d3a; border-color: #d92d3a; }
    .sacudir { animation: sacudir 380ms ease; }
    @keyframes sacudir { 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
    @media (prefers-reduced-motion: reduce) { .sacudir { animation: none; } }
  `,
})
export class PuntosClaveComponent {
  readonly cantidad = input(0);
  readonly largo = input(4);
  readonly error = input(false);
  readonly sacudir = input(false);
  readonly lista = computed(() => Array.from({ length: this.largo() }));
}
