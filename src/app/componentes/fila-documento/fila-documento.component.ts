import { Component, computed, input, output } from '@angular/core';
import { EstadoFoto } from '../foto-tile/foto-tile.component';

/**
 * Tarjeta de un documento (SOAT, Tarjeta de propiedad, Selfie...) como en el prototipo:
 * ícono, nombre, una línea de ayuda y a la derecha "Listo" o "Subir".
 *
 * Con [archivo]="true" la tarjeta abre directamente la cámara/galería (selfie);
 * sin él solo avisa con (tocar) y la página decide (p. ej. pedir antes la fecha de vencimiento).
 */
@Component({
  selector: 'app-fila-documento',
  template: `
    <label class="fila" [class.lista]="lista()" [class.rechazada]="estado() === 'rechazado'" [class.cargando]="avance() !== null">
      @if (archivo()) {
        <input
          type="file"
          [attr.accept]="soloImagen() ? 'image/*' : 'image/*,application/pdf'"
          [attr.capture]="camara()"
          [disabled]="avance() !== null"
          (change)="cambio($event)"
          [attr.aria-label]="nombre()"
        />
      } @else {
        <button type="button" class="tocar" [disabled]="avance() !== null" (click)="tocar.emit()" [attr.aria-label]="nombre() + ': ' + pildora()"></button>
      }

      <span class="icono" [class.persona]="icono() === 'persona'" aria-hidden="true">
        @if (icono() === 'persona') {
          <svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4" /><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" /></svg>
        } @else if (icono() === 'casco') {
          <svg viewBox="0 0 24 24"><path d="M4 15a8 8 0 0 1 16 0v2H4z" /><path d="M12 7v4M4 17h16" /></svg>
        } @else {
          <svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>
        }
      </span>

      <span class="textos">
        <b>{{ nombre() }}</b>
        <small>{{ detalle() }}</small>
      </span>

      <span class="pildora" [class.subir]="!lista() && estado() !== 'rechazado' && avance() === null" aria-hidden="true">
        {{ pildora() }}
      </span>

      @if (avance() !== null) {
        <span class="barra" aria-hidden="true"><span [style.transform]="'scaleX(' + (avance() ?? 0) + ')'"></span></span>
      }
    </label>
  `,
  styleUrl: 'fila-documento.component.scss',
})
export class FilaDocumentoComponent {
  readonly nombre = input.required<string>();
  readonly ayuda = input<string | null>(null);
  readonly estado = input<EstadoFoto>('falta');
  readonly avance = input<number | null>(null);
  /** "2026-12-31" → se muestra "Vigente · vence 12/2026". */
  readonly vence = input<string | null>(null);
  readonly observacion = input<string | null>(null);
  readonly icono = input<'documento' | 'persona' | 'casco'>('documento');
  readonly archivo = input(false);
  readonly soloImagen = input(true);
  readonly camara = input<'environment' | 'user' | null>(null);

  readonly tocar = output<void>();
  readonly elegida = output<File>();

  readonly lista = computed(() => this.estado() === 'pendiente' || this.estado() === 'aprobado');

  readonly pildora = computed(() => {
    if (this.avance() !== null) return `${Math.round((this.avance() ?? 0) * 100)} %`;
    if (this.estado() === 'aprobado') return 'Aprobado';
    if (this.lista()) return 'Listo';
    if (this.estado() === 'rechazado') return 'Repetir';
    return 'Subir';
  });

  readonly detalle = computed(() => {
    if (this.estado() === 'rechazado') return this.observacion() || 'Rechazado: vuelve a subirlo';
    const v = this.vence();
    if (this.lista() && v) {
      const [a, m] = v.split('-');
      return `Vigente · vence ${m}/${a}`;
    }
    return this.ayuda() ?? '';
  });

  cambio(e: Event): void {
    const campo = e.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = '';
    if (archivo) this.elegida.emit(archivo);
  }
}
