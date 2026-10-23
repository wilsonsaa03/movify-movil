import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { BuscadorLugarComponent } from '../../../../componentes/buscador-lugar/buscador-lugar.component';
import { Lugar, LugaresService } from '../../../../servicios/lugares.service';
import { UbicacionService } from '../../../../servicios/ubicacion.service';
import { EncomiendaService, celularValido } from '../../../../servicios/encomienda.service';

/**
 * Encomienda 1 · Envía un paquete.
 * RECOGER EN = el GPS (o lo que elija), ENTREGAR EN = buscador / mapa. ¿Quién lo recibe? nombre y celular
 * (le llega el código por SMS) o "Lo recibo yo mismo". "Continuar" → Encomienda 2 (Paquete).
 */
@Component({
  selector: 'app-encomienda-destino',
  templateUrl: 'encomienda-destino.page.html',
  styleUrls: ['encomienda-destino.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, BuscadorLugarComponent],
})
export class EncomiendaDestinoPage implements ViewDidEnter, ViewWillLeave {
  private readonly nav = inject(NavController);
  private readonly gps = inject(UbicacionService);
  private readonly lugares = inject(LugaresService);
  readonly envio = inject(EncomiendaService);

  /** Qué punto se está buscando (pantalla completa encima). */
  readonly buscando = signal<'origen' | 'destino' | null>(null);
  /** Después del primer "Continuar" se marcan los campos que faltan. */
  readonly intento = signal(false);

  /** RECOGER EN: lo elegido o, si no, la posición del GPS con su dirección. */
  readonly recoger = computed<{ titulo: string; detalle: string | null } | null>(() => {
    const o = this.envio.origen();
    if (o) return { titulo: o.nombre === 'Mi ubicación' && o.detalle ? `Mi ubicación · ${o.detalle}` : o.nombre, detalle: o.barrio };
    const u = this.gps.ubicacion();
    if (!u) return null;
    return { titulo: u.direccion ? `Mi ubicación · ${u.direccion}` : 'Mi ubicación', detalle: u.barrio };
  });

  readonly faltaOrigen = computed(() => !this.envio.origen() && !this.gps.ubicacion());
  readonly faltaDestino = computed(() => !this.envio.destino());
  readonly faltaNombre = computed(() => !this.envio.recibeYo() && !this.envio.nombreRecibe().trim());
  readonly faltaCelular = computed(() => !this.envio.recibeYo() && !celularValido(this.envio.celularRecibe()));
  readonly listo = computed(() => !this.faltaOrigen() && !this.faltaDestino() && !this.faltaNombre() && !this.faltaCelular());

  ionViewDidEnter(): void {
    this.gps.seguir();
  }

  ionViewWillLeave(): void {
    this.gps.dejarDeSeguir();
  }

  volver(): void {
    this.nav.back();
  }

  elegido(l: Lugar): void {
    if (this.buscando() === 'origen') this.envio.origen.set(l);
    else {
      this.envio.destino.set(l);
      this.lugares.recordar(l);
    }
    this.buscando.set(null);
  }

  alternarRecibeYo(): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.envio.recibeYo.update((v) => !v);
  }

  /** Solo números y espacios cada 3-3-4 ("310 555 0142"). */
  escribirCelular(valor: string): string {
    const d = valor.replace(/\D/g, '').slice(0, 10);
    const bonito = [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
    this.envio.celularRecibe.set(bonito);
    return bonito;
  }

  continuar(): void {
    if (!this.listo()) {
      // No se avanza: se dice qué falta (los campos se marcan en rojo)
      this.intento.set(true);
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
      return;
    }
    if (!this.envio.origen()) {
      const u = this.gps.ubicacion()!;
      this.envio.origen.set({ nombre: 'Mi ubicación', detalle: u.direccion, barrio: u.barrio, lat: u.lat, lng: u.lng });
    }
    this.nav.navigateForward('/cliente/encomienda/paquete');
  }
}
