import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type NombreIcono =
  | 'moto' | 'taxi' | 'domicilio' | 'encomienda'
  | 'casa' | 'corazon' | 'trabajo' | 'pin'
  | 'atras' | 'adelante' | 'abajo'
  | 'reloj' | 'candado' | 'escudo' | 'alerta'
  | 'telefono' | 'mensaje' | 'compartir'
  | 'estrella' | 'check' | 'x' | 'play' | 'pausa' | 'microfono'
  | 'campana' | 'lista' | 'persona' | 'dinero' | 'poder' | 'navegar'
  | 'comida' | 'farmacia' | 'mercado' | 'diligencia';

/**
 * Íconos de línea de MoviFY (24×24, trazo redondeado, toman el color del texto).
 *   <app-icono nombre="moto" />
 * Tamaño y grosor desde el CSS del padre:  app-icono { width: 20px; height: 20px; --grosor: 2.4; }
 */
@Component({
  selector: 'app-icono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      @switch (nombre()) {
        @case ('moto') {
          <svg:circle cx="5.5" cy="16.5" r="3" /><svg:circle cx="18.5" cy="16.5" r="3" />
          <svg:path d="M5.5 16.5l4-6h5l4 6M14.5 10.5l-1.5-4h3" />
        }
        @case ('taxi') {
          <svg:path d="M5 17h14v-4l-2-5H7l-2 5v4zM9 5h6v3M5 13h14" />
          <svg:circle cx="8" cy="17" r="1.6" /><svg:circle cx="16" cy="17" r="1.6" />
        }
        @case ('domicilio') { <svg:path d="M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2" /> }
        @case ('encomienda') { <svg:path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5L12 12l9-4.5M12 12v9" /> }
        @case ('casa') { <svg:path d="M4 11l8-7 8 7v9H4zM10 20v-5h4v5" /> }
        @case ('corazon') { <svg:path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /> }
        @case ('trabajo') { <svg:path d="M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9 7V5h6v2" /> }
        @case ('pin') {
          <svg:path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><svg:circle cx="12" cy="10" r="2.4" />
        }
        @case ('atras') { <svg:path d="M19 12H5M11 6l-6 6 6 6" /> }
        @case ('adelante') { <svg:path d="M5 12h14M13 6l6 6-6 6" /> }
        @case ('abajo') { <svg:path d="M6 9l6 6 6-6" /> }
        @case ('reloj') { <svg:circle cx="12" cy="12" r="8.5" /><svg:path d="M12 7.5V12l3 2" /> }
        @case ('candado') { <svg:path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z" /> }
        @case ('escudo') { <svg:path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6zM8.8 12l2.2 2.2 4.2-4.4" /> }
        @case ('alerta') { <svg:path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6zM12 8v5M12 16v.5" /> }
        @case ('telefono') {
          <svg:path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
        }
        @case ('mensaje') { <svg:path d="M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5" /> }
        @case ('compartir') {
          <svg:circle cx="18" cy="5" r="2.6" /><svg:circle cx="6" cy="12" r="2.6" /><svg:circle cx="18" cy="19" r="2.6" />
          <svg:path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" />
        }
        @case ('estrella') {
          <svg:path class="relleno" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
        }
        @case ('check') { <svg:path d="M5 12.5l4.5 4.5L19 7.5" /> }
        @case ('x') { <svg:path d="M6 6l12 12M18 6L6 18" /> }
        @case ('play') { <svg:path class="relleno" d="M8 5.5v13l10-6.5z" /> }
        @case ('pausa') { <svg:path d="M8.5 5.5v13M15.5 5.5v13" /> }
        @case ('microfono') { <svg:path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /> }
        @case ('campana') { <svg:path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0" /> }
        @case ('lista') { <svg:path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /> }
        @case ('persona') { <svg:circle cx="12" cy="8" r="4" /><svg:path d="M4 21a8 8 0 0 1 16 0" /> }
        @case ('dinero') { <svg:path d="M3 6h18v12H3zM6.5 9.5v.01M17.5 14.5v.01" /><svg:circle cx="12" cy="12" r="2.8" /> }
        @case ('poder') { <svg:path d="M12 3v8M6.4 6.8a8 8 0 1 0 11.2 0" /> }
        @case ('navegar') { <svg:path d="M12 3l7.5 18-7.5-4.5L4.5 21z" /> }
        @case ('comida') { <svg:path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 21V3c-2 1.5-3 4-3 7v3h3" /> }
        @case ('farmacia') {
          <svg:path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 8V5h8v3M12 11.5v6M9 14.5h6" />
        }
        @case ('mercado') {
          <svg:path d="M3 4h2.5l2.2 11h10.6L20.5 7H7" /><svg:circle cx="9.5" cy="19" r="1.5" /><svg:circle cx="17" cy="19" r="1.5" />
        }
        @case ('diligencia') { <svg:path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12.5l2 2 3.5-3.5" /> }
      }
    </svg>
  `,
  styles: `
    :host { display: inline-block; width: 24px; height: 24px; flex-shrink: 0; line-height: 0; }
    svg {
      width: 100%; height: 100%;
      fill: none; stroke: currentColor; stroke-width: var(--grosor, 2.2);
      stroke-linecap: round; stroke-linejoin: round;
    }
    .relleno { fill: var(--relleno, none); }
  `,
})
export class IconoComponent {
  readonly nombre = input.required<NombreIcono>();
}
