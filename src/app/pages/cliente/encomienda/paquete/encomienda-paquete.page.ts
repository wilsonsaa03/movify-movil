import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { IconoComponent, NombreIcono } from '../../../../componentes/icono/icono.component';
import { EncomiendaService, PROHIBIDOS, TAMANOS, Tamano } from '../../../../servicios/encomienda.service';
import { contenidoProhibido } from '../../../../servicios/contenido-prohibido';

/**
 * Encomienda 2 · ¿Qué vas a enviar?
 * Tamaño (sobre / pequeño = moto, mediano = taxi), qué hay adentro y si es frágil. "Ver tarifa" → Encomienda 3.
 */
@Component({
  selector: 'app-encomienda-paquete',
  templateUrl: 'encomienda-paquete.page.html',
  styleUrls: ['encomienda-paquete.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent],
})
export class EncomiendaPaquetePage implements ViewDidEnter {
  private readonly nav = inject(NavController);
  readonly envio = inject(EncomiendaService);

  readonly tamanos = TAMANOS;
  readonly prohibidos = PROHIBIDOS;
  readonly verLista = signal(false);
  readonly intento = signal(false);
  readonly faltaContenido = computed(() => !this.envio.contenido().trim());
  /** Drogas, armas, dinero, robado…: se avisa al escribir y no se deja seguir (el backend también lo rechaza). */
  readonly prohibido = computed(() => contenidoProhibido(this.envio.contenido()));

  ionViewDidEnter(): void {
    // Si se llegó sin la entrega (recargando la página), se vuelve al paso 1
    if (!this.envio.origen() || !this.envio.destino()) {
      this.nav.navigateRoot('/cliente/encomienda', { animationDirection: 'back' });
    }
  }

  volver(): void {
    this.nav.back();
  }

  icono(t: Tamano): NombreIcono {
    return t === 'sobre' ? 'mensaje' : t === 'pequeno' ? 'encomienda' : 'trabajo';
  }

  elegir(t: Tamano): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.envio.tamano.set(t);
  }

  alternarFragil(): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.envio.fragil.update((v) => !v);
  }

  verTarifa(): void {
    if (this.faltaContenido() || this.prohibido()) {
      this.intento.set(true);
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
      return;
    }
    this.nav.navigateForward('/cliente/encomienda/confirmar');
  }
}
