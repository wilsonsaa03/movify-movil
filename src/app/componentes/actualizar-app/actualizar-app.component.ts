import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { VersionAppService } from '../../core/version-app';
import { IconoComponent } from '../icono/icono.component';

/**
 * Aviso de versión (app.component):
 *  - obligatoria: pantalla completa que no deja seguir hasta actualizar (la versión ya no es compatible).
 *  - sugerida: franja abajo que se puede cerrar.
 */
@Component({
  selector: 'app-actualizar-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    @if (version.estado() === 'obligatoria') {
      <section class="bloqueo" role="alertdialog" aria-modal="true" aria-labelledby="act-titulo">
        <img src="assets/brand/movify-isotipo.svg" alt="" width="70" height="86" />
        <h1 id="act-titulo">Actualiza MoviFY</h1>
        <p>Esta versión ya no funciona con el servicio. Actualízala en Google Play para seguir pidiendo y haciendo viajes.</p>
        <button type="button" class="boton" (click)="version.abrirTienda()">Actualizar ahora</button>
        @if (version.instalada()) { <small>Tienes la versión {{ version.instalada() }}</small> }
      </section>
    } @else if (version.estado() === 'sugerida' && !cerrada()) {
      <div class="franja" role="status">
        <app-icono nombre="alerta" />
        <span>Hay una versión nueva de MoviFY.</span>
        <button type="button" class="franja-btn" (click)="version.abrirTienda()">Actualizar</button>
        <button type="button" class="franja-x" (click)="cerrada.set(true)" aria-label="Ahora no"><app-icono nombre="x" /></button>
      </div>
    }
  `,
  styles: `
    .bloqueo {
      position: fixed; inset: 0; z-index: 3000; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; padding: 32px 28px; text-align: center; background: #021b36; color: #e8f1f8; font-family: 'Nunito', system-ui, sans-serif;
    }
    h1 { margin: 8px 0 0; font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 32px; color: #ffffff; }
    p { margin: 0; max-width: 320px; font-size: 16px; line-height: 1.5; color: #b7c9da; }
    .boton { margin-top: 12px; width: min(320px, 100%); height: 54px; border: 0; border-radius: 999px; background: #fe7b13; color: #03274d; font: inherit; font-weight: 800; font-size: 17px; }
    small { color: #7f97ad; }
    .franja {
      position: fixed; left: 12px; right: 12px; bottom: calc(84px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom))); z-index: 2000;
      display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 16px;
      background: #03274d; color: #ffffff; font-family: 'Nunito', system-ui, sans-serif; font-size: 14px; font-weight: 700;
      box-shadow: 0 14px 30px -12px rgba(3, 39, 77, 0.6);
    }
    .franja app-icono { width: 20px; height: 20px; color: #ffc93c; flex: none; }
    .franja span { flex: 1; }
    .franja-btn { border: 0; border-radius: 999px; padding: 7px 12px; background: #02aab4; color: #03274d; font: inherit; font-weight: 800; }
    .franja-x { border: 0; background: none; color: #ffffff; width: 32px; height: 32px; }
    .franja-x app-icono { color: #ffffff; width: 16px; height: 16px; }
  `,
})
export class ActualizarAppComponent {
  protected readonly version = inject(VersionAppService);
  protected readonly cerrada = signal(false);
}
