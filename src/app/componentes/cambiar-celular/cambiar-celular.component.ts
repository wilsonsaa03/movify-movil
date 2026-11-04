import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { ApiService, ErrorApi } from '../../core/api.service';
import { SesionService } from '../../core/sesion.service';
import { IconoComponent } from '../icono/icono.component';

/**
 * Cambiar el celular de la cuenta (cliente y conductor): quien cambió de SIM no pierde su cuenta.
 *   1. POST /usuarios/telefono/codigo { celular }                 → SMS al número NUEVO
 *   2. POST /auth/codigo/verificar { celular, proposito: cambio_telefono, codigo } → verificacionToken
 *   3. POST /usuarios/telefono/verificar { verificacionToken }    → queda guardado y verificado
 * Así nadie puede poner en su cuenta un número que no tiene en la mano.
 */
@Component({
  selector: 'app-cambiar-celular',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <div class="fondo" (click)="cerrar.emit()" aria-hidden="true"></div>
    <section class="hoja" role="dialog" aria-modal="true" aria-labelledby="cc-titulo">
      <span class="agarre" aria-hidden="true"></span>
      @if (paso() === 'numero') {
        <h2 id="cc-titulo">Cambiar mi celular</h2>
        <p class="sub">Te enviaremos un código por SMS al número nuevo para confirmar que es tuyo.</p>
        <label class="etiqueta" for="cc-celular">Celular nuevo</label>
        <div class="celular">
          <span class="prefijo">+57</span>
          <input #campo id="cc-celular" class="entrada" type="tel" inputmode="numeric" autocomplete="tel-national"
                 maxlength="10" placeholder="300 123 4567" [value]="celular()" (input)="celular.set(soloNumeros($any($event.target).value, 10))" />
        </div>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <button type="button" class="boton" [disabled]="ocupado() || celular().length !== 10" (click)="pedirCodigo()">
          {{ ocupado() ? 'Enviando…' : 'Enviar código' }}
        </button>
      } @else {
        <h2 id="cc-titulo">Escribe el código</h2>
        <p class="sub">Lo enviamos por SMS al <b>+57 {{ celular() }}</b>.</p>
        <label class="etiqueta" for="cc-codigo">Código de 6 números</label>
        <input #campo id="cc-codigo" class="entrada codigo" type="text" inputmode="numeric" autocomplete="one-time-code"
               maxlength="6" placeholder="000000" [value]="codigo()" (input)="codigo.set(soloNumeros($any($event.target).value, 6))" />
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <button type="button" class="boton" [disabled]="ocupado() || codigo().length !== 6" (click)="confirmar()">
          {{ ocupado() ? 'Confirmando…' : 'Confirmar cambio' }}
        </button>
        <button type="button" class="enlace" [disabled]="ocupado()" (click)="volver()">Corregir el número</button>
      }
      <button type="button" class="cerrar" (click)="cerrar.emit()" aria-label="Cerrar"><app-icono nombre="x" /></button>
    </section>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-end; font-family: 'Nunito', system-ui, sans-serif; }
    .fondo { position: absolute; inset: 0; background: rgba(3, 39, 77, 0.45); }
    .hoja {
      position: relative; width: 100%; padding: 14px 22px calc(22px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
      border-radius: 26px 26px 0 0; background: #ffffff; color: #03274d;
      animation: sube 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .agarre { display: block; width: 44px; height: 5px; margin: 0 auto 12px; border-radius: 99px; background: #d5dde6; }
    h2 { margin: 4px 0 4px; font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 24px; }
    .sub { margin: 0 0 14px; font-size: 14px; line-height: 1.45; color: #4c6680; }
    .etiqueta { display: block; margin-bottom: 6px; font-weight: 800; font-size: 13px; }
    .celular { display: flex; align-items: center; gap: 8px; }
    .prefijo { padding: 0 12px; height: 50px; display: grid; place-items: center; border-radius: 14px; background: #f1f5f9; font-weight: 800; }
    .entrada {
      flex: 1; width: 100%; box-sizing: border-box; height: 50px; padding: 0 14px; border-radius: 14px;
      border: 2px solid transparent; background: #f1f5f9; font: inherit; font-size: 17px; font-weight: 700; color: #03274d;
    }
    .entrada:focus { outline: none; border-color: #02aab4; background: #ffffff; }
    .codigo { letter-spacing: 8px; font-size: 22px; text-align: center; }
    .error { margin: 8px 0 0; font-size: 13.5px; font-weight: 700; color: #b42318; }
    .boton {
      margin-top: 16px; width: 100%; height: 52px; border: 0; border-radius: 999px;
      background: #fe7b13; color: #03274d; font: inherit; font-weight: 800; font-size: 16px;
    }
    .boton:disabled { opacity: 0.55; }
    .enlace { margin-top: 10px; width: 100%; border: 0; background: none; font: inherit; font-weight: 800; color: #007c84; }
    .cerrar { position: absolute; top: 12px; right: 12px; width: 40px; height: 40px; border: 0; border-radius: 50%; background: #f1f5f9; color: #03274d; }
    .cerrar app-icono { width: 18px; height: 18px; }
    @keyframes sube { from { transform: translateY(100%); } to { transform: none; } }
    @media (prefers-reduced-motion: reduce) { .hoja { animation: none; } }
  `,
})
export class CambiarCelularComponent {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  /** Celular nuevo ya guardado (+57…). */
  readonly cambiado = output<string>();
  readonly cerrar = output<void>();

  readonly paso = signal<'numero' | 'codigo'>('numero');
  readonly celular = signal('');
  readonly codigo = signal('');
  readonly ocupado = signal(false);
  readonly error = signal('');

  soloNumeros(v: string, max: number): string {
    return (v || '').replace(/\D/g, '').slice(0, max);
  }

  async pedirCodigo(): Promise<void> {
    if (!/^3\d{9}$/.test(this.celular())) {
      this.error.set('Escribe un celular colombiano de 10 números que empiece por 3.');
      return;
    }
    await this.hacer(async () => {
      await this.api.post('/usuarios/telefono/codigo', { celular: this.celular() });
      this.paso.set('codigo');
      this.codigo.set('');
      setTimeout(() => this.campo()?.nativeElement.focus());
    });
  }

  async confirmar(): Promise<void> {
    await this.hacer(async () => {
      const v = await this.api.post<{ verificacionToken: string }>('/auth/codigo/verificar', {
        celular: this.celular(),
        proposito: 'cambio_telefono',
        codigo: this.codigo(),
      });
      const r = await this.api.post<{ telefono: string }>('/usuarios/telefono/verificar', { verificacionToken: v.verificacionToken });
      const d = this.sesion.datos();
      if (d) this.sesion.guardar({ ...d, telefono: r.telefono });
      this.cambiado.emit(r.telefono);
    });
  }

  volver(): void {
    this.paso.set('numero');
    this.error.set('');
  }

  private async hacer(accion: () => Promise<void>): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await accion();
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos cambiar el celular. Intenta de nuevo.');
    } finally {
      this.ocupado.set(false);
    }
  }
}
