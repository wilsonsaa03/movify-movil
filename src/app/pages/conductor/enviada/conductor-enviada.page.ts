import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { ErrorApi } from '../../../core/api.service';
import { ConductorRegistroService } from '../../../servicios/conductor-registro.service';

interface Hito {
  titulo: string;
  detalle?: string;
  estado: 'hecho' | 'actual' | 'futuro';
}

/**
 * Conductor 6 · "¡Solicitud enviada!" — línea de tiempo de la revisión.
 * La misma pantalla muestra "¡Ya puedes trabajar!" cuando el admin aprueba, o manda a corregir si rechazó algo.
 */
@Component({
  selector: 'app-conductor-enviada',
  templateUrl: 'conductor-enviada.page.html',
  styleUrls: ['conductor-enviada.page.scss'],
  imports: [IonContent],
})
export class ConductorEnviadaPage {
  private readonly nav = inject(NavController);
  readonly registro = inject(ConductorRegistroService);

  readonly actualizando = signal(false);
  readonly error = signal('');

  readonly siguiente = computed(() => this.registro.progreso()?.siguiente ?? 'revision');
  readonly aprobado = computed(() => this.siguiente() === 'aprobado');
  readonly corregir = computed(() => this.siguiente() === 'corregir');

  readonly hitos = computed<Hito[]>(() => {
    const ok = this.aprobado();
    return [
      { titulo: 'Registrado', estado: 'hecho' },
      { titulo: 'Documentos enviados', estado: 'hecho' },
      {
        titulo: this.corregir() ? 'Hay algo por corregir' : 'En revisión',
        detalle: this.corregir()
          ? (this.registro.progreso()?.motivo_estado ?? 'Revisa los documentos marcados')
          : ok
            ? 'Revisamos tus documentos'
            : 'Normalmente de 1 a 3 días hábiles',
        estado: ok ? 'hecho' : 'actual',
      },
      { titulo: 'Cuenta activa', detalle: ok ? '¡Ya puedes recibir viajes!' : 'Te avisaremos por SMS', estado: ok ? 'hecho' : 'futuro' },
    ];
  });

  constructor() {
    this.actualizar();
  }

  async actualizar(): Promise<void> {
    this.actualizando.set(true);
    this.error.set('');
    try {
      await this.registro.cargar();
    } catch (e) {
      this.error.set((e as ErrorApi).message);
    } finally {
      this.actualizando.set(false);
    }
  }

  principal(): void {
    if (this.aprobado()) this.nav.navigateRoot('/conductor/inicio');
    else if (this.corregir()) this.nav.navigateForward('/conductor/documentos');
    else this.nav.navigateRoot('/inicio');
  }
}
