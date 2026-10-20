import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { ApiService } from '../../../core/api.service';
import { pesos } from '../../../core/formato';

interface Reporte {
  id: number;
  tipo: string;
  asunto: string;
  estado: string;
  estado_nombre: string;
  servicio_id: number | null;
  fecha_limite_respuesta: string | null;
  valor: number | null;
  fecha_viaje: string | null;
  otro_nombres: string | null;
  otro_apellidos: string | null;
}

/**
 * Viaje 8 · Reporte enviado (v2) — "Recibimos tu reporte" (?id=ticket).
 * La usan el conductor (reportó a un pasajero) y el cliente (reportó a un conductor); la ruta trae
 * `data.inicio` y `data.viajes` para saber a dónde van "Volver al inicio" y "Ver mis viajes".
 *
 * El reporte se crea con POST /api/pqrs (tipo "incidente_seguridad", el motivo va en `asunto`)
 * y aquí se lee con GET /api/pqrs/{id}.
 */
@Component({
  selector: 'app-reporte-enviado',
  templateUrl: 'reporte-enviado.page.html',
  styleUrls: ['reporte-enviado.page.scss'],
  imports: [IonContent],
})
export class ReporteEnviadoPage {
  private readonly nav = inject(NavController);
  private readonly api = inject(ApiService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly id = Number(this.ruta.snapshot.queryParamMap.get('id'));

  readonly reporte = signal<Reporte | null>(null);

  /** #MV-2482 */
  readonly numero = computed(() => {
    const r = this.reporte();
    return r ? 'MV-' + String(r.id).padStart(4, '0') : '';
  });

  readonly nombre = computed(() => this.reporte()?.otro_nombres?.split(' ')[0] ?? '');
  readonly iniciales = computed(() => {
    const r = this.reporte();
    return ((r?.otro_nombres?.[0] ?? '') + (r?.otro_apellidos?.[0] ?? r?.otro_nombres?.[1] ?? '')).toUpperCase();
  });

  /** "Hoy · 6:48 p. m. · $6.500" */
  readonly detalleViaje = computed(() => {
    const r = this.reporte();
    if (!r?.fecha_viaje) return '';
    const f = new Date(r.fecha_viaje);
    const hoy = new Date();
    const dia =
      f.toDateString() === hoy.toDateString()
        ? 'Hoy'
        : f.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
    const hora = f.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
    return [dia, hora, r.valor != null ? pesos(r.valor) : ''].filter(Boolean).join(' · ');
  });

  /** Paso en el que va: 0 recibido · 1 en revisión · 2 respondido. */
  readonly avance = computed(() => {
    const e = this.reporte()?.estado;
    return e === 'resuelto' || e === 'cerrado' ? 2 : 1;
  });

  constructor() {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    if (!this.id) return;
    try {
      this.reporte.set(await this.api.get<Reporte>('/pqrs/' + this.id));
    } catch {
      /* si falla, la pantalla igual confirma que el reporte quedó enviado */
    }
  }

  volverAlInicio(): void {
    this.nav.navigateRoot(this.ruta.snapshot.data['inicio'] ?? '/cliente');
  }

  verViajes(): void {
    this.nav.navigateForward(this.ruta.snapshot.data['viajes'] ?? '/cliente/pedidos');
  }
}
