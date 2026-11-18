import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormasPago, MetodoPago, NOMBRE_METODO, PagosService } from '../../servicios/pagos.service';

/**
 * "¿Cómo vas a pagar?" en la confirmación del viaje, el domicilio o la encomienda: Efectivo, Nequi o Daviplata
 * (estos dos solo si el backend tiene pagos digitales). Lo elegido queda en PagosService.preferida().
 *
 *   <app-forma-pago [soloEfectivo]="pagaDestinatario()" />
 */
@Component({
  selector: 'app-forma-pago',
  template: `
    @if (formas(); as f) {
      @if (f.metodos.length > 1 && !soloEfectivo() && resumen() && !abierto()) {
        <p class="resumen">
          <span class="marca" [class]="'marca ' + pagos.preferida()" aria-hidden="true">{{ inicial(pagos.preferida()) }}</span>
          <span>Pagas con <b>{{ nombre(pagos.preferida()) }}</b>{{ pagos.preferida() === 'efectivo' ? ' al conductor' : ' al terminar' }}</span>
          <button type="button" class="cambiar" (click)="abierto.set(true)">Cambiar</button>
        </p>
      } @else if (f.metodos.length > 1 && !soloEfectivo()) {
        <fieldset class="forma">
          <legend>¿Cómo vas a pagar?</legend>
          <div class="opciones">
            @for (m of f.metodos; track m) {
              <label class="opcion" [class.activa]="pagos.preferida() === m">
                <input type="radio" name="forma-pago" [value]="m" [checked]="pagos.preferida() === m" (change)="pagos.elegir(m)" />
                <span class="marca" [class]="'marca ' + m" aria-hidden="true">{{ inicial(m) }}</span>
                {{ nombre(m) }}
              </label>
            }
          </div>
          <small>
            @if (pagos.preferida() === 'efectivo') {
              Le pagas al conductor al terminar.
            } @else {
              Pagas desde la app al terminar. Si el pago no se aprueba, pagas en efectivo.
              @if (f.de_prueba) { <b class="prueba">Modo de prueba: no se cobra plata real.</b> }
            }
          </small>
        </fieldset>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .forma { margin: 0 0 12px; padding: 0; border: 0; min-width: 0; }
    legend { padding: 0; margin-bottom: 8px; font: 800 14px 'Nunito', system-ui, sans-serif; color: #03274d; }
    .opciones { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .opcion {
      position: relative; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px;
      padding: 4px 6px; text-align: center; overflow-wrap: anywhere; border-radius: 14px; border: 1.5px solid #c9d4e0; background: #fff; color: #03274d;
      font: 800 12px 'Nunito', system-ui, sans-serif; cursor: pointer; -webkit-tap-highlight-color: transparent;
    }
    .opcion.activa { border-color: #03274d; background: #eef3f8; }
    .opcion:has(input:focus-visible) { outline: 3px solid #00a3ad; outline-offset: 2px; }
    input { position: absolute; opacity: 0; pointer-events: none; }
    .marca { flex-shrink: 0; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; font-size: 11px; color: #fff; background: #2e9d5b; }
    .marca.nequi { background: #200020; }
    .marca.daviplata { background: #e30613; }
    .marca.tarjeta { background: #1f4fa6; }
    .marca.pse { background: #0b5c99; }
    .marca.bancolombia { background: #fdda24; color: #2c2a29; }
    small { display: block; margin-top: 8px; font: 600 12px 'Nunito', system-ui, sans-serif; color: #4f6275; }
    .prueba { display: block; color: #8a5a00; }
    .resumen { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font: 600 13px 'Nunito', system-ui, sans-serif; color: #03274d; }
    .resumen > span:nth-child(2) { flex: 1; min-width: 0; }
    .cambiar { border: 0; background: none; padding: 6px 4px; color: #00838c; font: 800 13px 'Nunito', system-ui, sans-serif; text-decoration: underline; }
  `,
})
export class FormaPagoComponent implements OnInit {
  readonly pagos = inject(PagosService);
  /** Encomienda que paga quien recibe: solo efectivo. */
  readonly soloEfectivo = input(false);
  /** Solo una línea con lo ya elegido ("Pagas con Nequi · Cambiar"): para no preguntar dos veces. */
  readonly resumen = input(false);
  readonly abierto = signal(false);
  readonly formas = signal<FormasPago | null>(null);

  async ngOnInit(): Promise<void> {
    const f = await this.pagos.formas();
    this.formas.set(f);
    // Si los pagos digitales se apagaron, se vuelve a efectivo
    if (!f.metodos.includes(this.pagos.preferida())) this.pagos.elegir('efectivo');
  }

  nombre(m: MetodoPago): string {
    return NOMBRE_METODO[m];
  }

  inicial(m: MetodoPago): string {
    return m === 'efectivo' ? '$' : NOMBRE_METODO[m].charAt(0);
  }
}

/** Lo que se manda en metodo_pago al pedir (efectivo si es solo efectivo). */
export function metodoParaPedir(pagos: PagosService, soloEfectivo = false): MetodoPago {
  return soloEfectivo ? 'efectivo' : pagos.preferida();
}
