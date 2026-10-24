import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService, ErrorApi } from '../../../../core/api.service';
import { pesos } from '../../../../core/formato';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { LugaresService } from '../../../../servicios/lugares.service';
import { DomicilioService, MIN_COMPRA, iconoPedido, tituloPedido } from '../../../../servicios/domicilio.service';

/**
 * Domicilio 2 · Confirma tu domicilio.
 * Ruta de la tienda a la casa con "Llega en 25–35 min", precio del domicilio (backend), el pedido aproximado
 * y el total a pagar al recibir. "Pedir domicilio" crea el servicio → Buscando (la misma de Viaje 4).
 */
@Component({
  selector: 'app-domicilio-confirmar',
  templateUrl: 'domicilio-confirmar.page.html',
  styleUrls: ['domicilio-confirmar.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent],
})
export class DomicilioConfirmarPage implements ViewDidEnter, AfterViewInit, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly api = inject(ApiService);
  private readonly lugares = inject(LugaresService);
  readonly pedido = inject(DomicilioService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;

  readonly cargando = signal(true);
  readonly pidiendo = signal(false);
  readonly error = signal('');
  readonly ruta = signal<PuntoMapa[]>([]);
  readonly etiqueta = signal<string | null>(null);
  readonly altoHoja = signal(0);
  readonly pesos = pesos;

  /** El mapa muestra la casa (punto) y la tienda (pin con su nombre), como en el Figma. */
  readonly casa = computed<PuntoMapa | null>(() => this.pedido.entrega());
  readonly tienda = computed(() => {
    const t = this.pedido.tienda();
    return t ? { lat: t.lat, lng: t.lng, nombre: t.nombre } : null;
  });
  readonly titulo = computed(() => tituloPedido(this.pedido.categoria()));
  readonly icono = computed(() => iconoPedido(this.pedido.categoria()));

  ngAfterViewInit(): void {
    this.medidor = new ResizeObserver(() => this.altoHoja.set(this.hojaRef().nativeElement.offsetHeight));
    this.medidor.observe(this.hojaRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.medidor?.disconnect();
  }

  ionViewDidEnter(): void {
    if (!this.pedido.tienda() || !this.pedido.entrega() || !this.pedido.descripcion().trim()) {
      this.nav.navigateRoot('/cliente/domicilio', { animationDirection: 'back' });
      return;
    }
    this.cargar();
  }

  volver(): void {
    this.nav.back();
  }

  async pedir(): Promise<void> {
    if (this.pidiendo() || !this.pedido.tarifa()) return;
    this.pidiendo.set(true);
    this.error.set('');
    try {
      const s = await this.pedido.pedir();
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
      this.pedido.olvidar();
      this.nav.navigateRoot('/cliente/viaje/buscando', { queryParams: { id: s.id } });
    } catch (e) {
      const err = e as ErrorApi;
      if (err.status === 409) {
        // Ya tiene un servicio andando: se lleva a ese en vez de crear otro
        const activo = await this.api.get<{ id: number; estado_codigo: string } | null>('/servicios/activo').catch(() => null);
        if (activo?.id) {
          this.nav.navigateRoot(activo.estado_codigo === 'buscando' ? '/cliente/viaje/buscando' : '/cliente/domicilio/seguimiento', {
            queryParams: { id: activo.id },
          });
          return;
        }
      }
      this.error.set(err.message || 'No pudimos pedir tu domicilio. Intenta de nuevo.');
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
    // La línea es de la casa a la tienda (en el Figma la tienda es el pin del final)
    this.lugares.ruta(this.pedido.entrega()!, this.pedido.tienda()!).then((r) => this.ruta.set(r.puntos));
    try {
      const c = await this.pedido.cotizar();
      // Llega en: lo que tarda el domiciliario (rango) + comprar, si le toca
      const base = c.min + (this.pedido.pagaDomiciliario() ? MIN_COMPRA : 0) + 10;
      this.etiqueta.set(`Llega en ${base}–${base + 10} min`);
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos calcular el precio.');
    } finally {
      this.cargando.set(false);
    }
  }
}
