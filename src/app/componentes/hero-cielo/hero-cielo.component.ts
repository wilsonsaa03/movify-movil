import { Component, computed, inject, input } from '@angular/core';
import { NavController } from '@ionic/angular';

/**
 * Encabezado reutilizable: cielo al atardecer, botón volver, título, logo 3D y olas.
 * Lo usan Crear cuenta, Iniciar sesión y las pantallas de registro.
 *
 *   <app-hero-cielo titulo="¡Únete a MoviFY!" subtitulo="Muévete fácil y seguro" />
 *   <app-hero-cielo titulo="Escribe el código" [paso]="2" [total]="4" />   ← versión con barra de pasos
 */
@Component({
  selector: 'app-hero-cielo',
  template: `
    <header class="cielo" [class.compacto]="!!paso()">
      <button type="button" class="volver" aria-label="Volver" (click)="volver()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      </button>

      @if (paso(); as p) {
        <div class="progreso" role="progressbar" [attr.aria-valuenow]="p" aria-valuemin="1" [attr.aria-valuemax]="total()" [attr.aria-label]="'Paso ' + p + ' de ' + total()">
          <span class="paso">Paso {{ p }} de {{ total() }}</span>
          <span class="barras">
            @for (b of barras(); track $index) {
              <span class="barra" [class.llena]="$index < p" [class.actual]="$index === p - 1"></span>
            }
          </span>
        </div>
      }

      <div class="sol" aria-hidden="true"></div>
      <svg class="gaviotas" viewBox="0 0 70 26" aria-hidden="true">
        <path d="M2 12q6-8 12 0q6-8 12 0" />
        <path class="lejos" d="M40 20q5-6 10 0q5-6 10 0" />
      </svg>

      <div class="texto entra">
        <h1>{{ titulo() }}</h1>
        @if (subtitulo()) {
          <p>{{ subtitulo() }}</p>
        }
      </div>

      @if (!paso()) {
        <div class="insignia entra" style="--d: 80ms">
          <img src="assets/marca/logo-3d.svg" alt="" draggable="false" />
        </div>
      }

      <div class="olas" aria-hidden="true">
        <svg class="ola o1" viewBox="0 0 804 140" preserveAspectRatio="none"><path [attr.d]="ola" /></svg>
        <svg class="ola o2" viewBox="0 0 804 140" preserveAspectRatio="none"><path [attr.d]="ola" /></svg>
        <svg class="ola o3" viewBox="0 0 804 140" preserveAspectRatio="none"><path [attr.d]="ola" /></svg>
      </div>
    </header>
  `,
  styleUrl: 'hero-cielo.component.scss',
})
export class HeroCieloComponent {
  private readonly nav = inject(NavController);

  readonly titulo = input.required<string>();
  readonly subtitulo = input<string>('');
  /** Si se indica, se muestra "Paso X de N" con barra de progreso (y sin logo). */
  readonly paso = input<number | null>(null);
  readonly total = input(4);
  readonly barras = computed(() => Array.from({ length: this.total() }));
  /** A dónde ir si no hay historial (por ejemplo, si abrieron la pantalla directamente). */
  readonly volverA = input<string>('/inicio');

  readonly ola = 'M0 50C67 20 134 20 201 50S335 80 402 50S536 20 603 50S737 80 804 50V140H0Z';

  volver(): void {
    if (window.history.length > 1) {
      this.nav.back();
    } else {
      this.nav.navigateBack(this.volverA());
    }
  }
}
