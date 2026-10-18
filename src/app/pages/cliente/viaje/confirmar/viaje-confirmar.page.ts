import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { LugaresService } from '../../../../servicios/lugares.service';
import { TipoVehiculo, ViajeService } from '../../../../servicios/viaje.service';
import { pesos } from '../../../../core/formato';

interface Opcion {
  tipo: TipoVehiculo;
  nombre: string;
  cupo: string;
  precio: number;
  llegada: number | null;
}

/**
 * Viaje 3 · Elige moto o taxi ("Confirma tu viaje").
 * Ruta real en el mapa (OSRM), precio fijo de cada vehículo desde el backend (/api/tarifas/cotizar) y
 * en cuánto llega el conductor libre más cercano. "Pedir moto" crea el servicio → Viaje 4 (Buscando).
 */
@Component({
  selector: 'app-viaje-confirmar',
  templateUrl: 'viaje-confirmar.page.html',
  styleUrls: ['viaje-confirmar.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent],
})
export class ViajeConfirmarPage implements ViewDidEnter, AfterViewInit, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly lugares = inject(LugaresService);
  readonly viaje = inject(ViajeService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;

  readonly cargando = signal(true);
  readonly pidiendo = signal(false);
  readonly error = signal('');
  readonly ruta = signal<PuntoMapa[]>([]);
  readonly altoHoja = signal(0);
  private readonly llegadas = signal<Record<TipoVehiculo, number | null>>({ moto: null, taxi: null });

  readonly origen = computed<PuntoMapa | null>(() => this.viaje.origen());
  readonly destino = computed(() => {
    const d = this.viaje.destino();
    return d ? { lat: d.lat, lng: d.lng, nombre: d.nombre } : null;
  });

  /** "12 min · 4,2 km" con los números del backend (los mismos con los que cobra). */
  readonly etiqueta = computed(() => {
    const c = this.viaje.cotizacion();
    return c ? `${c.duracion_min} min · ${c.distancia_km.toFixed(1).replace('.', ',')} km` : null;
  });

  readonly opciones = computed<Opcion[]>(() => {
    const c = this.viaje.cotizacion();
    if (!c) return [];
    const orden: TipoVehiculo[] = ['moto', 'taxi'];
    return orden
      .map((tipo) => c.opciones.find((o) => o.tipo_vehiculo === tipo))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => ({
        tipo: o.tipo_vehiculo,
        nombre: o.tipo_vehiculo === 'moto' ? 'Moto' : 'Taxi',
        cupo: o.tipo_vehiculo === 'moto' ? '1 pasajero' : 'Hasta 4',
        precio: o.valor_estimado,
        llegada: this.llegadas()[o.tipo_vehiculo],
      }));
  });

  readonly elegida = computed(() => this.opciones().find((o) => o.tipo === this.viaje.tipo()) ?? null);
  readonly otro = computed(() => (this.viaje.tipo() === 'moto' ? 'taxi' : 'moto'));
  readonly pesos = pesos;

  ngAfterViewInit(): void {
    this.medidor = new ResizeObserver(() => this.altoHoja.set(this.hojaRef().nativeElement.offsetHeight));
    this.medidor.observe(this.hojaRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.medidor?.disconnect();
  }

  ionViewDidEnter(): void {
    if (!this.viaje.listoParaCotizar()) {
      this.nav.navigateRoot('/cliente/viaje/destino', { animationDirection: 'back' });
      return;
    }
    this.cargar();
  }

  volver(): void {
    this.nav.back();
  }

  elegir(t: TipoVehiculo): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.viaje.tipo.set(t);
  }

  async pedir(): Promise<void> {
    if (this.pidiendo() || !this.elegida()) return;
    this.pidiendo.set(true);
    this.error.set('');
    try {
      const s = await this.viaje.pedir();
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
      this.viaje.olvidar();
      // Raíz: desde "Buscando" el botón atrás no debe volver a esta pantalla (el viaje ya existe)
      this.nav.navigateRoot('/cliente/viaje/buscando', { queryParams: { id: s.id } });
    } catch (e) {
      const err = e as ErrorApi;
      if (err.status === 409) {
        // Ya tiene un viaje andando: se lleva a ese en vez de crear otro
        const activo = await this.viaje.activo().catch(() => null);
        if (activo?.estado_codigo === 'buscando') {
          this.nav.navigateRoot('/cliente/viaje/buscando', { queryParams: { id: activo.id } });
          return;
        }
      }
      this.error.set(err.message || 'No pudimos pedir el viaje. Intenta de nuevo.');
    } finally {
      this.pidiendo.set(false);
    }
  }

  async reintentar(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    const o = this.viaje.origen()!;
    const d = this.viaje.destino()!;
    // Las tres consultas van en paralelo; la ruta y la llegada son "extras" y no frenan el precio
    this.lugares.ruta(o, d).then((r) => this.ruta.set(r.puntos));
    this.viaje.llegadas().then((l) => this.llegadas.set(l));
    try {
      await this.viaje.cotizar();
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos calcular el precio.');
    } finally {
      this.cargando.set(false);
    }
  }
}
