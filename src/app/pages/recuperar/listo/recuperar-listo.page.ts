import { Component, inject } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { RecuperarService } from '../../../servicios/recuperar.service';

/** Recuperar clave · Listo: la clave ya cambió; se entra escribiéndola. */
@Component({
  selector: 'app-recuperar-listo',
  templateUrl: 'recuperar-listo.page.html',
  // Mismo cielo, medalla y olas que "¡Listo!" del registro
  styleUrls: ['../../registro/listo/registro-listo.page.scss'],
  imports: [IonContent],
})
export class RecuperarListoPage {
  private readonly nav = inject(NavController);
  readonly recuperar = inject(RecuperarService);

  readonly confeti = [
    { x: 12, y: 12, t: 8, c: '#ffffff', d: 0 },
    { x: 86, y: 8, t: 10, c: '#02aab4', d: 80 },
    { x: 92, y: 26, t: 7, c: '#ffffff', d: 160 },
    { x: 20, y: 34, t: 7, c: '#03274d', d: 120 },
    { x: 8, y: 52, t: 9, c: '#02aab4', d: 200 },
    { x: 80, y: 44, t: 8, c: '#03274d', d: 40 },
  ];

  entrar(): void {
    const celular = this.recuperar.celular();
    this.recuperar.iniciar();
    this.nav.navigateRoot('/login/clave', { queryParams: { celular } });
  }
}
