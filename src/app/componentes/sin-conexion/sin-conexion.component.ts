import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { IconoComponent } from '../icono/icono.component';

/** Lo que se guarda del catálogo para poder mostrarlo aunque no haya internet. */
const CLAVE_CENTRAL = 'movify.telefono_central';

/**
 * Aviso "Sin internet" arriba de toda la app (en Buenaventura la señal se cae seguido).
 * Si el admin configuró el teléfono de la central (configuracion_sistema.telefono_central), ofrece
 * "Pedir por llamada" para no quedarse sin servicio. Se guarda en el celular para tenerlo sin conexión.
 */
@Component({
  selector: 'app-sin-conexion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    @if (!enLinea()) {
      <div class="aviso" role="status" aria-live="assertive">
        <app-icono nombre="alerta" />
        <span class="texto"><b>Sin internet</b><small>Seguimos intentando. Tu viaje no se pierde.</small></span>
        @if (central()) {
          <a class="llamar" [href]="'tel:' + central()">Pedir por llamada</a>
        }
      </div>
    }
  `,
  styles: `
    :host { position: fixed; z-index: 30000; left: 0; right: 0; top: 0; pointer-events: none; }
    .aviso {
      pointer-events: auto;
      margin: calc(env(safe-area-inset-top) + 8px) 12px 0; padding: 10px 12px; border-radius: 16px;
      display: flex; align-items: center; gap: 10px;
      background: #03274d; color: #ffffff; box-shadow: 0 10px 24px rgba(3, 39, 77, 0.35);
      font-family: 'Nunito', system-ui, sans-serif;
      animation: bajar 260ms cubic-bezier(0.23, 1, 0.32, 1) both;
    }
    app-icono { width: 22px; height: 22px; flex-shrink: 0; color: #ffc94d; }
    .texto { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    b { font-size: 14px; font-weight: 800; }
    small { font-size: 12px; font-weight: 700; color: #c8d6e5; }
    .llamar {
      min-height: 40px; padding: 0 12px; border-radius: 12px; display: grid; place-items: center;
      background: #fe7b13; color: #ffffff; font-size: 13px; font-weight: 800; text-decoration: none; white-space: nowrap;
    }
    .llamar:focus-visible { outline: 3px solid #ffffff; outline-offset: 2px; }
    @keyframes bajar { from { opacity: 0; transform: translateY(-12px); } }
    @media (prefers-reduced-motion: reduce) { .aviso { animation: none; } }
  `,
})
export class SinConexionComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  readonly enLinea = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private readonly telefono = signal<string>(leer());
  /** Solo dígitos y +, para tel: */
  readonly central = computed(() => this.telefono().replace(/[^\d+]/g, ''));

  private readonly alCambiar = () => this.enLinea.set(navigator.onLine);

  constructor() {
    window.addEventListener('online', this.alCambiar);
    window.addEventListener('offline', this.alCambiar);
    // Con internet se actualiza el teléfono de la central (por si el admin lo cambió)
    this.api
      .get<{ telefono_central?: string }>('/catalogos')
      .then((c) => {
        const t = (c.telefono_central ?? '').trim();
        this.telefono.set(t);
        try {
          localStorage.setItem(CLAVE_CENTRAL, t);
        } catch {
          /* almacenamiento bloqueado */
        }
      })
      .catch(() => undefined);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.alCambiar);
    window.removeEventListener('offline', this.alCambiar);
  }
}

function leer(): string {
  try {
    return localStorage.getItem(CLAVE_CENTRAL) ?? '';
  } catch {
    return '';
  }
}
