import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NavController } from '@ionic/angular';
import { IconoComponent, NombreIcono } from '../icono/icono.component';

export interface ItemBarra {
  texto: string;
  icono: NombreIcono;
  ruta: string;
}

/**
 * Barra de navegación inferior (cliente: Inicio · Mis pedidos · Perfil;
 * conductor: Inicio · Mis viajes · Ganancias · Perfil). La pestaña activa lleva la "píldora" naranja clara.
 */
@Component({
  selector: 'app-barra-inferior',
  imports: [IconoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="barra" aria-label="Navegación principal">
      @for (item of items(); track item.ruta) {
        <button
          type="button"
          class="item"
          [class.activo]="item.ruta === activa()"
          [attr.aria-current]="item.ruta === activa() ? 'page' : null"
          (click)="ir(item.ruta)"
        >
          <span class="pildora"><app-icono [nombre]="item.icono" /></span>
          {{ item.texto }}
        </button>
      }
    </nav>
  `,
  styles: `
    :host { display: block; }
    .barra {
      display: flex; justify-content: space-around;
      padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
      background: #ffffff; border-top: 1.5px solid #e4ebf2;
    }
    .item {
      flex: 1; border: 0; background: none; padding: 2px 0; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      font-family: 'Nunito', system-ui, sans-serif; font-size: 12px; font-weight: 700; color: #5b6b80;
      -webkit-tap-highlight-color: transparent;
    }
    .pildora {
      width: 56px; height: 30px; border-radius: 15px; display: grid; place-items: center;
      transition: background-color 200ms ease;
    }
    app-icono { width: 22px; height: 22px; }
    .activo { color: #03274d; font-weight: 800; }
    .activo .pildora { background: #ffe3cc; }
    .item:focus-visible { outline: 3px solid #02aab4; outline-offset: 2px; border-radius: 12px; }
  `,
})
export class BarraInferiorComponent {
  private readonly nav = inject(NavController);
  readonly items = input.required<ItemBarra[]>();
  readonly activa = input.required<string>();

  ir(ruta: string): void {
    if (ruta !== this.activa()) this.nav.navigateRoot(ruta, { animated: false });
  }
}
