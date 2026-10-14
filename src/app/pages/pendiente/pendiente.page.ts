import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';

/**
 * PROVISIONAL: marca las pantallas que todavía no se han construido
 * (Iniciar sesión, Crear cuenta, Explorar, Términos...).
 * El título llega desde la ruta: data: { titulo: '...' }.
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
        <a routerLink="/inicio">Volver al inicio</a>
      </div>
    </ion-content>
  `,
  styles: `
    .caja { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; }
    h1 { font-family: 'Baloo 2', sans-serif; font-weight: 800; color: #03274d; margin: 0; }
    p { font-family: 'Nunito', sans-serif; color: rgba(3, 39, 77, .6); margin: 0; }
    .chip { background: #e6f7f8; color: #007c85; font-weight: 800; padding: 4px 12px; border-radius: 999px; }
    a { font-family: 'Nunito', sans-serif; font-weight: 800; color: #007c85; margin-top: 12px; }
  `,
})
export class PendientePage {
  private readonly ruta = inject(ActivatedRoute);
  readonly titulo: string = this.ruta.snapshot.data['titulo'] ?? 'Próximamente';
  readonly servicio: string | null = this.ruta.snapshot.queryParamMap.get('servicio');
}
