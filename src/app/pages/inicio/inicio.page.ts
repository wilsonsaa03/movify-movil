import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export type TipoServicio = 'taxi' | 'moto' | 'domicilio' | 'encomienda';

interface Servicio {
  id: TipoServicio;
  nombre: string;
  color: string;
  colorOscuro: string; // el "grosor" de la baldosa 3D
}

@Component({
  selector: 'app-inicio',
  templateUrl: 'inicio.page.html',
  styleUrls: ['inicio.page.scss'],
  imports: [IonContent],
})
export class InicioPage {
  private readonly router = inject(Router);

  /** Una ola que se repite cada 402 px; el SVG mide el doble para poder deslizarla sin cortes. */
  readonly ola = 'M0 50C67 20 134 20 201 50S335 80 402 50S536 20 603 50S737 80 804 50V140H0Z';

  readonly servicios: Servicio[] = [
    { id: 'taxi', nombre: 'Taxis', color: '#FFC94D', colorOscuro: '#C98F12' },
    { id: 'moto', nombre: 'Motos', color: '#5FD6DC', colorOscuro: '#1E9AA2' },
    { id: 'domicilio', nombre: 'Domicilios', color: '#FF9A4D', colorOscuro: '#C8601A' },
    { id: 'encomienda', nombre: 'Encomiendas', color: '#8EE07A', colorOscuro: '#4E9F3C' },
  ];

  /** Para pedir un servicio hay que tener cuenta: se va a iniciar sesión recordando cuál eligió. */
  elegirServicio(id: TipoServicio): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.router.navigate(['/login'], { queryParams: { servicio: id } });
  }

  ir(ruta: string): void {
    this.router.navigateByUrl(ruta);
  }
}
