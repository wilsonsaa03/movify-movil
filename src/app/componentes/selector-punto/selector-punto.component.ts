import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { IconoComponent } from '../icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../mapa-ciudad/mapa-ciudad.component';
import { Lugar } from '../../servicios/lugares.service';
import { UbicacionService } from '../../servicios/ubicacion.service';

/**
 * Elegir un punto tocando el mapa (pantalla completa encima de la página).
 * El mapa abre en el GPS del usuario o, si no hay, en Buenaventura; se mueve con un dedo.
 * Al tocar se pone el pin y se busca la dirección; "Usar este punto" lo entrega como Lugar.
 *
 *   @if (eligiendo()) { <app-selector-punto tipo="destino" (elegido)="..." (cerrar)="eligiendo.set(false)" /> }
 */
@Component({
  selector: 'app-selector-punto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MapaCiudadComponent, IconoComponent],
  templateUrl: './selector-punto.component.html',
  styleUrls: ['./selector-punto.component.scss'],
})
export class SelectorPuntoComponent {
  private readonly gps = inject(UbicacionService);

  readonly tipo = input<'origen' | 'destino'>('destino');
  readonly elegido = output<Lugar>();
  readonly cerrar = output<void>();
  /** Solo en la recogida: volver a usar la ubicación del GPS. */
  readonly usarGps = output<void>();

  /** Posición al abrir (fija: si siguiera al GPS en vivo, el mapa se movería mientras el usuario busca el sitio). */
  readonly miPunto = signal<PuntoMapa | null>(this.posicionInicial());
  readonly punto = signal<Lugar | null>(null);
  readonly nombrando = signal(false);
  readonly pin = computed(() => {
    const p = this.punto();
    return p ? { lat: p.lat, lng: p.lng, nombre: p.nombre } : null;
  });

  async tocar(p: PuntoMapa): Promise<void> {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.punto.set({ nombre: 'Punto en el mapa', detalle: null, barrio: null, lat: p.lat, lng: p.lng });
    this.nombrando.set(true);
    try {
      const d = await this.gps.buscarDireccion(p.lat, p.lng);
      const actual = this.punto();
      // Solo si sigue siendo el último punto tocado
      if (actual && actual.lat === p.lat && actual.lng === p.lng) {
        this.punto.set({ ...actual, nombre: d.direccion ?? d.barrio ?? 'Punto en el mapa', detalle: d.direccion ? d.barrio : null, barrio: d.barrio });
      }
    } catch {
      /* sin internet: queda "Punto en el mapa" (las coordenadas son lo que cuenta) */
    } finally {
      this.nombrando.set(false);
    }
  }

  confirmar(): void {
    const p = this.punto();
    if (p) this.elegido.emit(p);
  }

  private posicionInicial(): PuntoMapa | null {
    const u = this.gps.ubicacion();
    return u ? { lat: u.lat, lng: u.lng } : null;
  }
}
