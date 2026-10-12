import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';

/**
 * PROVISIONAL: aquí irá la pantalla "Iniciar sesión" del Figma.
 * Existe solo para que el deslizador de la pantalla Principal tenga a dónde ir.
 */
@Component({
  selector: 'app-login',
  imports: [IonContent, RouterLink],
  template: `
    <ion-content class="ion-padding">
      <div class="caja">
        <h1>Iniciar sesión</h1>
        <p>Próxima pantalla por construir.</p>
        <a routerLink="/bienvenida">Volver a la Principal</a>
      </div>
    </ion-content>
  `,
  styles: `
    .caja { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; }
    h1 { font-family: 'Baloo 2', sans-serif; font-weight: 800; color: #03274d; margin: 0; }
    p { font-family: 'Nunito', sans-serif; color: rgba(3, 39, 77, .6); margin: 0; }
    a { font-family: 'Nunito', sans-serif; font-weight: 800; color: #007c85; margin-top: 12px; }
  `,
})
export class LoginPage {}
