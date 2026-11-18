import { Component, OnDestroy, effect, inject, input, signal, untracked } from '@angular/core';
import { ApiService } from '../../core/api.service';

/**
 * El cliente ve la foto que tomó el conductor al entregar (domicilio y encomienda).
 * La foto es privada: se descarga con el token (GET /api/servicios/{id}/evidencias/{eid}/archivo).
 *
 *   <app-ver-foto-entrega [servicioId]="id" [evidenciaId]="s.foto_entrega_id" />
 */
@Component({
  selector: 'app-ver-foto-entrega',
  template: `
    @if (url(); as u) {
      <figure class="foto entra">
        <img [src]="u" alt="Foto de la entrega tomada por el conductor" />
        <figcaption>Foto de la entrega</figcaption>
      </figure>
    }
  `,
  styles: `
    :host { display: block; }
    .foto { margin: 0 0 12px; border-radius: 16px; overflow: hidden; background: #eef3f8; }
    img { display: block; width: 100%; max-height: 260px; object-fit: cover; }
    figcaption { padding: 8px 12px; font: 800 13px 'Nunito', system-ui, sans-serif; color: #03274d; }
  `,
})
export class VerFotoEntregaComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  readonly servicioId = input.required<number>();
  readonly evidenciaId = input<number | null | undefined>(null);
  readonly url = signal<string | null>(null);
  private cargada: number | null = null;

  constructor() {
    effect(() => {
      const id = this.servicioId();
      const eid = this.evidenciaId();
      if (!id || !eid || eid === this.cargada) return;
      this.cargada = eid;
      untracked(() => this.cargar(id, eid));
    });
  }

  ngOnDestroy(): void {
    const u = this.url();
    if (u) URL.revokeObjectURL(u);
  }

  private async cargar(id: number, eid: number): Promise<void> {
    try {
      const b = await this.api.blob(`/servicios/${id}/evidencias/${eid}/archivo`);
      const antes = this.url();
      this.url.set(URL.createObjectURL(b));
      if (antes) URL.revokeObjectURL(antes);
    } catch {
      this.cargada = null; // se reintenta en la próxima lectura del servicio
    }
  }
}
