import { Component, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { ConductorRegistroService, TipoVehiculo } from '../../../servicios/conductor-registro.service';

interface Opcion {
  tipo: TipoVehiculo;
  licencia: string;
  nombre: string;
  puntos: string[];
}

/** Conductor 0 · "¿Con qué vas a trabajar?" — moto o taxi decide qué papeles se piden. */
@Component({
  selector: 'app-conductor-tipo',
  templateUrl: 'conductor-tipo.page.html',
  styleUrls: ['conductor-tipo.page.scss'],
  imports: [IonContent, HeroCieloComponent],
})
export class ConductorTipoPage {
  private readonly nav = inject(NavController);
  private readonly registro = inject(ConductorRegistroService);

  readonly elegido = signal<TipoVehiculo | null>(this.registro.tipoElegido());

  readonly opciones: Opcion[] = [
    { tipo: 'moto', licencia: 'Licencia A1 o A2', nombre: 'Moto', puntos: ['Viajes de 1 pasajero', 'Domicilios y encomiendas', 'Casco para tu pasajero'] },
    { tipo: 'taxi', licencia: 'Licencia C1', nombre: 'Taxi', puntos: ['Viajes de hasta 4 pasajeros', 'Domicilios y encomiendas', 'Tarjeta de operación vigente'] },
  ];

  continuar(): void {
    const t = this.elegido();
    if (!t) return;
    this.registro.elegirTipo(t);
    this.nav.navigateForward('/conductor/identidad');
  }
}
