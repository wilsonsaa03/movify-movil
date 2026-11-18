import { Component, inject } from '@angular/core';
import { NavController } from '@ionic/angular';
import { pesos } from '../../core/formato';
import { CatalogoDomicilioService } from '../../servicios/catalogo-domicilio.service';

/**
 * Barra flotante "Ver carrito · 3 · $45.900" (como la canasta de Rappi). Solo aparece si hay productos.
 *   <app-barra-carrito />
 */
@Component({
  selector: 'app-barra-carrito',
  template: `
    @if (cat.carrito(); as c) {
      <button type="button" class="barra entra" (click)="abrir()" [attr.aria-label]="'Ver carrito de ' + c.comercio.nombre + ': ' + cat.unidades() + ' productos, ' + pesos(cat.subtotal())">
        <span class="num" aria-hidden="true">{{ cat.unidades() }}</span>
        <span class="textos"><b>Ver carrito</b><small>{{ c.comercio.nombre }}</small></span>
        <span class="precio">{{ pesos(cat.subtotal()) }}</span>
      </button>
    }
  `,
  styles: `
    :host { display: block; }
    .barra {
      width: 100%; min-height: 58px; padding: 8px 16px 8px 10px; border: 0; border-radius: 18px;
      display: flex; align-items: center; gap: 12px; background: #03274d; color: #fff; cursor: pointer;
      font-family: 'Nunito', system-ui, sans-serif; box-shadow: 0 10px 24px rgba(3, 39, 77, 0.3);
      -webkit-tap-highlight-color: transparent; transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
    }
    .barra:active { transform: scale(0.98); }
    .barra:focus-visible { outline: 3px solid #00a3ad; outline-offset: 2px; }
    .num { min-width: 34px; height: 34px; padding: 0 6px; border-radius: 12px; display: grid; place-items: center;
      background: #fe7b13; font-weight: 900; font-size: 15px; }
    .textos { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }
    .textos b { font-size: 15px; font-weight: 800; }
    .textos small { max-width: 100%; font-size: 12px; font-weight: 700; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .precio { font-family: 'Baloo 2', system-ui, sans-serif; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
  `,
})
export class BarraCarritoComponent {
  readonly cat = inject(CatalogoDomicilioService);
  private readonly nav = inject(NavController);
  readonly pesos = pesos;

  abrir(): void {
    this.nav.navigateForward('/cliente/domicilio/carrito');
  }
}
