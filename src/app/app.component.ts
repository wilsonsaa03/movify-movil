import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { App } from '@capacitor/app';
import { SinConexionComponent } from './componentes/sin-conexion/sin-conexion.component';
import { ActualizarAppComponent } from './componentes/actualizar-app/actualizar-app.component';
import { PushService } from './core/push.service';
import { SesionService } from './core/sesion.service';
import { VersionAppService } from './core/version-app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, SinConexionComponent, ActualizarAppComponent],
})
export class AppComponent {
  private readonly sesion = inject(SesionService);
  private readonly push = inject(PushService);
  private readonly version = inject(VersionAppService);

  constructor() {
    // Con sesión abierta (al iniciar o después del login) se registran las notificaciones push del celular
    effect(() => {
      if (this.sesion.datos()) this.push.iniciar();
    });
    // ¿La versión instalada sigue sirviendo? Al abrir y cada vez que vuelve del segundo plano
    this.version.revisar();
    App.addListener('appStateChange', (e) => {
      if (e.isActive) this.version.revisar();
    }).catch(() => undefined);
  }
}
