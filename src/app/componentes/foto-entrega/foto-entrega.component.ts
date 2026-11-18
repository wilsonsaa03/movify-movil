import { Component, OnDestroy, inject, input, output, signal } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService, ErrorApi } from '../../core/api.service';
import { reducirFoto } from '../../core/foto';
import { EstadoFoto, FotoTileComponent } from '../foto-tile/foto-tile.component';

/**
 * Foto de la entrega (app del conductor): domicilio y encomienda no se pueden finalizar sin ella.
 * Abre la cámara trasera, reduce la foto y la sube a POST /api/servicios/{id}/evidencias (tipo entrega).
 * El cliente la ve en el seguimiento y en el resumen.
 *
 *   <app-foto-entrega [servicioId]="id" (subida)="fotoLista.set(true)" />
 */
@Component({
  selector: 'app-foto-entrega',
  imports: [FotoTileComponent],
  template: `
    <div class="caja">
      <app-foto-tile
        [etiqueta]="lista() ? 'Foto de la entrega lista' : 'Toma la foto de la entrega'"
        [estado]="estado()"
        [avance]="avance()"
        [vista]="vista()"
        camara="environment"
        (elegida)="subir($event)"
      />
      <p class="ayuda">
        @if (error()) {
          <span class="error" role="alert">{{ error() }}</span>
        } @else if (lista()) {
          El cliente ya puede verla. Si quedó mal, tócala para tomar otra.
        } @else {
          Que se vea el paquete o el pedido en la puerta o en manos de quien recibe.
        }
      </p>
    </div>
  `,
  styles: `
    :host { display: block; }
    .caja { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px; align-items: center; margin: 0 0 12px; }
    .ayuda { margin: 0; font: 600 13px 'Nunito', system-ui, sans-serif; color: #4f6275; }
    .error { color: #c0392b; font-weight: 800; }
  `,
})
export class FotoEntregaComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  readonly servicioId = input.required<number>();
  readonly tipo = input<'entrega' | 'recogida' | 'factura_compra'>('entrega');
  readonly subida = output<number>();

  readonly lista = signal(false);
  readonly estado = signal<EstadoFoto>('falta');
  readonly avance = signal<number | null>(null);
  readonly vista = signal<string | null>(null);
  readonly error = signal('');

  ngOnDestroy(): void {
    const v = this.vista();
    if (v) URL.revokeObjectURL(v);
  }

  async subir(archivo: File): Promise<void> {
    this.error.set('');
    this.avance.set(0);
    const anterior = this.vista();
    this.vista.set(URL.createObjectURL(archivo));
    if (anterior) URL.revokeObjectURL(anterior);
    try {
      const foto = await reducirFoto(archivo);
      const form = new FormData();
      form.append('foto', foto, 'entrega.jpg');
      form.append('tipo', this.tipo());
      const r = await this.api.subir<{ id: number }>(`/servicios/${this.servicioId()}/evidencias`, form, (f) => this.avance.set(f));
      this.lista.set(true);
      this.estado.set('aprobado');
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
      this.subida.emit(r.id);
    } catch (e) {
      this.estado.set(this.lista() ? 'aprobado' : 'rechazado');
      this.error.set((e as ErrorApi).message || 'No se pudo subir la foto. Intenta de nuevo.');
    } finally {
      this.avance.set(null);
    }
  }
}
