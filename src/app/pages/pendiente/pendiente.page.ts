import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { ApiService } from '../../core/api.service';
import { SesionService } from '../../core/sesion.service';

/**
 * PROVISIONAL: marca las pantallas que todavía no se han construido
 * (inicio del cliente, panel del conductor, recuperar clave...).
 * El título llega desde la ruta: data: { titulo: '...' }.
 * Si hay sesión muestra quién entró y el botón "Cerrar sesión" (para probar el login).
 */
@Component({
  selector: 'app-pendiente',
  imports: [IonContent, RouterLink],
  template: `
    <ion-content class="ion-padding">
      <div class="caja">
        <h1>{{ titulo }}</h1>
        @if (servicio) {
          <p class="chip">Servicio elegido: {{ servicio }}</p>
        }
        <p>Pantalla por construir.</p>
        @if (sesion.datos(); as s) {
          <button type="button" class="volver" (click)="volver()">← Volver</button>
          <p class="quien">Entraste como <b>{{ s.nombres || s.nombre }}</b> · {{ s.rol }}</p>
          <button type="button" class="salir" [disabled]="saliendo()" (click)="salir()">
            {{ saliendo() ? 'Cerrando…' : 'Cerrar sesión' }}
          </button>
        } @else {
          <a routerLink="/inicio">Volver al inicio</a>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .caja { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; }
    h1 { font-family: 'Baloo 2', sans-serif; font-weight: 800; color: #03274d; margin: 0; }
    p { font-family: 'Nunito', sans-serif; color: rgba(3, 39, 77, .6); margin: 0; }
    .chip { background: #e6f7f8; color: #007c85; font-weight: 800; padding: 4px 12px; border-radius: 999px; }
    .quien { margin-top: 12px; }
    .quien b { color: #03274d; }
    a { font-family: 'Nunito', sans-serif; font-weight: 800; color: #007c85; margin-top: 12px; }
    .salir {
      margin-top: 12px; height: 48px; padding: 0 24px; border: 0; border-radius: 24px;
      background: #03274d; color: #fff; font-family: 'Nunito', sans-serif; font-size: 15px; font-weight: 800; cursor: pointer;
    }
    .salir:disabled { opacity: .6; }
    .volver { margin-top: 12px; border: 0; background: none; font-family: 'Nunito', sans-serif; font-size: 15px; font-weight: 800; color: #007c85; cursor: pointer; }
  `,
})
export class PendientePage {
  private readonly ruta = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly nav = inject(NavController);
  readonly sesion = inject(SesionService);

  readonly titulo: string = this.ruta.snapshot.data['titulo'] ?? 'Próximamente';
  readonly servicio: string | null = this.ruta.snapshot.queryParamMap.get('servicio');
  readonly saliendo = signal(false);

  /** Regresa a la pantalla anterior; si se abrió directo, a su inicio. */
  volver(): void {
    if (window.history.length > 1) this.nav.back();
    else this.nav.navigateRoot(this.sesion.rutaInicio(), { animationDirection: 'back' });
  }

  async salir(): Promise<void> {
    this.saliendo.set(true);
    await this.api.cerrarSesion();
    this.nav.navigateRoot('/login');
  }
}
