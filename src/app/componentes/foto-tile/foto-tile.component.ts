import { Component, computed, input, output } from '@angular/core';

export type EstadoFoto = 'falta' | 'pendiente' | 'aprobado' | 'rechazado';

/**
 * Casilla para tomar o elegir una foto (Frente, Reverso, Atrás, Placa...).
 * Tal como el prototipo: vacía muestra la cámara; subida se pone turquesa con el chulo.
 *
 *   <app-foto-tile etiqueta="Frente" [estado]="'falta'" [avance]="0.4" (elegida)="subir('cedula', $event)" />
 */
@Component({
  selector: 'app-foto-tile',
  template: `
    <label
      class="tile"
      [class.lista]="lista()"
      [class.rechazada]="estado() === 'rechazado'"
      [class.cargando]="avance() !== null"
      [class.deshabilitada]="deshabilitado()"
    >
      <input
        type="file"
        accept="image/*"
        [attr.capture]="camara()"
        [disabled]="deshabilitado() || avance() !== null"
        (change)="cambio($event)"
        [attr.aria-label]="etiqueta() + (lista() ? ' (ya subida, toca para cambiarla)' : '')"
      />

      @if (vista(); as v) {
        <img class="miniatura" [src]="v" alt="" />
      }

      <span class="icono" aria-hidden="true">
        @if (avance() !== null) {
          <svg class="anillo" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" class="pista" />
            <circle cx="18" cy="18" r="15" class="relleno" [style.stroke-dashoffset]="94.25 * (1 - (avance() ?? 0))" />
          </svg>
        } @else if (lista()) {
          <span class="chulo"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        } @else if (estado() === 'rechazado') {
          <svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></svg>
        } @else {
          <svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
        }
      </span>

      <span class="nombre">{{ etiqueta() }}</span>
      @if (detalle(); as d) {
        <small>{{ d }}</small>
      }
    </label>
  `,
  styleUrl: 'foto-tile.component.scss',
})
export class FotoTileComponent {
  readonly etiqueta = input.required<string>();
  readonly estado = input<EstadoFoto>('falta');
  /** 0 a 1 mientras sube; null si no está subiendo. */
  readonly avance = input<number | null>(null);
  readonly vista = input<string | null>(null);
  /** "environment" abre la cámara trasera, "user" la frontal (selfie). */
  readonly camara = input<'environment' | 'user' | null>(null);
  readonly deshabilitado = input(false);
  readonly mostrarAyuda = input(true);

  readonly elegida = output<File>();

  readonly lista = computed(() => this.estado() === 'pendiente' || this.estado() === 'aprobado');
  readonly detalle = computed(() => {
    if (this.avance() !== null) return `Subiendo ${Math.round((this.avance() ?? 0) * 100)} %`;
    if (this.estado() === 'rechazado') return 'Repetir foto';
    if (!this.lista() && this.mostrarAyuda()) return 'Toca para subir';
    return '';
  });

  cambio(e: Event): void {
    const campo = e.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = ''; // permite volver a elegir la misma foto
    if (archivo) this.elegida.emit(archivo);
  }
}
