import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { SinConexionComponent } from './componentes/sin-conexion/sin-conexion.component';
import { PushService } from './core/push.service';
import { SesionService } from './core/sesion.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, SinConexionComponent],
})
export class AppComponent {
  private readonly sesion = inject(SesionService);
  private readonly push = inject(PushService);

  constructor() {
    // Con sesión abierta (al iniciar o después del login) se registran las notificaciones push del celular
    effect(() => {
      if (this.sesion.datos()) this.push.iniciar();
    });
  }
}
