import { Component, computed, inject } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { RegistroService } from '../../../servicios/registro.service';

/** Registro terminado: la cuenta ya existe. */
@Component({
  selector: 'app-registro-listo',
  templateUrl: 'registro-listo.page.html',
  styleUrls: ['registro-listo.page.scss'],
  imports: [IonContent],
})
export class RegistroListoPage {
  private readonly nav = inject(NavController);
  readonly registro = inject(RegistroService);

  readonly nombre = computed(() => this.registro.datos()?.nombre.split(' ')[0] ?? '');
  readonly esConductor = computed(() => this.registro.rol() === 'conductor');

  /** Confeti: posición (%), tamaño (px), color y retraso de cada punto. */
  readonly confeti = [
    { x: 12, y: 12, t: 8, c: '#ffffff', d: 0 },
    { x: 86, y: 8, t: 10, c: '#02aab4', d: 80 },
    { x: 92, y: 26, t: 7, c: '#ffffff', d: 160 },
    { x: 20, y: 34, t: 7, c: '#03274d', d: 120 },
    { x: 8, y: 52, t: 9, c: '#02aab4', d: 200 },
    { x: 80, y: 44, t: 8, c: '#03274d', d: 40 },
    { x: 94, y: 62, t: 7, c: '#ffffff', d: 240 },
    { x: 30, y: 6, t: 6, c: '#5fd6dc', d: 280 },
    { x: 66, y: 16, t: 6, c: '#ffffff', d: 320 },
  ];

  /** Desde aquí no se vuelve al registro: estas rutas reemplazan el historial. */
  pedirViaje(): void {
    this.nav.navigateRoot('/cliente');
  }

  subirDocumentos(): void {
    this.nav.navigateRoot('/conductor/documentos');
  }

  irAlInicio(): void {
    this.nav.navigateRoot('/inicio');
  }
}
