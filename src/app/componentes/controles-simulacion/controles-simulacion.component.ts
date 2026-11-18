import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconoComponent } from '../icono/icono.component';
import { distancia } from '../../core/formato';
import { SimulacionViajeService } from '../../servicios/simulacion-viaje.service';

/** Velocidades rápidas para la demo (km/h). */
const VELOCIDADES = [20, 35, 60, 100];

/**
 * Controles del viaje simulado (app del conductor): iniciar/pausar/reanudar, reiniciar, llegar ya y velocidad,
 * con el avance, la distancia restante y el tiempo estimado. Lo que se toca aquí lo ve el pasajero al instante
 * (todo pasa por el backend: una sola fuente de verdad).
 *
 *   <app-controles-simulacion [sim]="sim" />
 */
@Component({
  selector: 'app-controles-simulacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    @if (sim().estado(); as e) {
      <section class="sim" aria-label="Viaje simulado">
        <div class="fila">
          <span class="chip" [class]="'chip ' + e.estado">{{ textoEstado() }}</span>
          <span class="datos">{{ restante() }} · {{ eta() }}</span>
        </div>
        <div class="barra" role="progressbar" aria-label="Avance del tramo" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="porcentaje()">
          <span [style.width.%]="porcentaje()"></span>
        </div>
        <div class="botones">
          @switch (e.estado) {
            @case ('corriendo') {
              <button type="button" (click)="sim().accion('pausar')" [disabled]="sim().ocupado()"><app-icono nombre="pausa" /> Pausar</button>
            }
            @case ('pausada') {
              <button type="button" class="principal" (click)="sim().accion('reanudar')" [disabled]="sim().ocupado()"><app-icono nombre="play" /> Reanudar</button>
            }
            @case ('lista') {
              <button type="button" class="principal" (click)="sim().accion('iniciar')" [disabled]="sim().ocupado()"><app-icono nombre="play" /> Iniciar</button>
            }
          }
          <button type="button" (click)="sim().accion('reiniciar')" [disabled]="sim().ocupado()">Reiniciar</button>
          <button type="button" (click)="sim().accion('finalizar')" [disabled]="sim().ocupado() || e.estado === 'llego'"><app-icono nombre="check" /> Llegar ya</button>
        </div>
        <div class="velocidades" role="group" aria-label="Velocidad">
          @for (v of velocidades; track v) {
            <button type="button" [class.activa]="e.velocidad_kmh === v" [attr.aria-pressed]="e.velocidad_kmh === v" (click)="sim().velocidad(v)" [disabled]="sim().ocupado()">
              {{ v }} km/h
            </button>
          }
        </div>
        @if (sim().error()) {
          <p class="error" role="alert">{{ sim().error() }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .sim {
      margin: 0 0 12px; padding: 12px 14px; border-radius: 16px; background: #f3f6fa; border: 1px dashed #b9c6d4;
      font-family: 'Nunito', system-ui, sans-serif; color: #03274d;
    }
    .fila { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .chip { padding: 3px 10px; border-radius: 999px; font: 800 12px 'Nunito', system-ui, sans-serif; background: #dfe6ee; }
    .chip.corriendo { background: #d9f3f4; color: #016b72; }
    .chip.pausada { background: #fff1d6; color: #8a5a00; }
    .chip.llego { background: #e1f5e6; color: #1d6b34; }
    .datos { font: 800 14px 'Nunito', system-ui, sans-serif; font-variant-numeric: tabular-nums; }
    .barra { height: 6px; margin: 10px 0; border-radius: 3px; background: #dfe6ee; overflow: hidden; }
    .barra span { display: block; height: 100%; background: #fe7b13; transition: width 600ms linear; }
    .botones, .velocidades { display: flex; flex-wrap: wrap; gap: 8px; }
    .velocidades { margin-top: 8px; }
    button {
      display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border-radius: 12px;
      border: 1.5px solid #c9d4e0; background: #ffffff; color: #03274d; font: 800 13px 'Nunito', system-ui, sans-serif;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    }
    button:active:not(:disabled) { transform: scale(0.97); }
    button:disabled { opacity: 0.5; }
    button.principal { background: #03274d; border-color: #03274d; color: #ffffff; }
    .velocidades button { min-height: 34px; padding: 0 10px; font-size: 12px; }
    .velocidades button.activa { background: #fe7b13; border-color: #fe7b13; color: #ffffff; }
    app-icono { width: 16px; height: 16px; }
    .error { margin: 8px 0 0; color: #c0392b; font: 700 13px 'Nunito', system-ui, sans-serif; }
  `,
})
export class ControlesSimulacionComponent {
  readonly sim = input.required<SimulacionViajeService>();
  readonly velocidades = VELOCIDADES;

  readonly porcentaje = computed(() => Math.round((this.sim().estado()?.progreso ?? 0) * 100));
  readonly restante = computed(() => distancia((this.sim().estado()?.restante_m ?? 0) / 1000));
  readonly eta = computed(() => {
    const e = this.sim().estado();
    if (!e || e.restante_m <= 0) return 'llegó';
    const s = Math.round(e.eta_s);
    return s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`;
  });
  readonly textoEstado = computed(() => {
    const e = this.sim().estado();
    const fase = e?.fase === 'recogida' ? 'a la recogida' : 'al destino';
    switch (e?.estado) {
      case 'corriendo':
        return `Simulación ${fase}`;
      case 'pausada':
        return 'En pausa';
      case 'llego':
        return 'Llegó';
      default:
        return 'Lista para iniciar';
    }
  });
}
