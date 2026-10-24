import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { pesos } from '../../../../core/formato';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { BuscadorLugarComponent } from '../../../../componentes/buscador-lugar/buscador-lugar.component';
import { Lugar, LugaresService } from '../../../../servicios/lugares.service';
import { UbicacionService } from '../../../../servicios/ubicacion.service';
import { contenidoProhibido } from '../../../../servicios/contenido-prohibido';
import { CATEGORIAS, Categoria, DomicilioService, TOPE_COMPRA } from '../../../../servicios/domicilio.service';

/**
 * Domicilio 1 · Pide un domicilio.
 * RECOGER EN = la tienda (buscador / mapa), ENTREGAR EN = el GPS o lo que elija. ¿Qué es?, qué hay que llevar
 * y quién paga el pedido en la tienda (ya está pago / el domiciliario con valor aproximado). "Ver tarifa" → Domicilio 2.
 */
@Component({
  selector: 'app-domicilio-pedido',
  templateUrl: 'domicilio-pedido.page.html',
  styleUrls: ['domicilio-pedido.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, BuscadorLugarComponent],
})
export class DomicilioPedidoPage implements ViewDidEnter, ViewWillLeave {
  private readonly nav = inject(NavController);
  private readonly gps = inject(UbicacionService);
  private readonly lugares = inject(LugaresService);
  readonly pedido = inject(DomicilioService);

  readonly categorias = CATEGORIAS;
  readonly pesos = pesos;
  readonly buscando = signal<'tienda' | 'entrega' | null>(null);
  readonly intento = signal(false);

  /** ENTREGAR EN: lo elegido o, si no, la posición del GPS con su dirección. */
  readonly entregar = computed<{ titulo: string; detalle: string | null } | null>(() => {
    const e = this.pedido.entrega();
    if (e) return { titulo: e.nombre === 'Mi ubicación' && e.detalle ? `Mi ubicación · ${e.detalle}` : e.nombre, detalle: e.barrio };
    const u = this.gps.ubicacion();
    if (!u) return null;
    return { titulo: u.direccion ? `Mi ubicación · ${u.direccion}` : 'Mi ubicación', detalle: u.barrio };
  });

  readonly faltaTienda = computed(() => !this.pedido.tienda());
  readonly faltaEntrega = computed(() => !this.pedido.entrega() && !this.gps.ubicacion());
  readonly faltaDescripcion = computed(() => !this.pedido.descripcion().trim());
  readonly prohibido = computed(() => contenidoProhibido(this.pedido.descripcion()));
  readonly errorValor = computed(() => {
    if (!this.pedido.pagaDomiciliario()) return '';
    const v = this.pedido.valorPedido() ?? 0;
    if (v <= 0) return '¿Cuánto cuesta más o menos? El domiciliario lo paga y tú se lo devuelves.';
    if (v > TOPE_COMPRA) return `Por ahora el domiciliario puede pagar pedidos de hasta ${pesos(TOPE_COMPRA)}.`;
    return '';
  });
  readonly listo = computed(
    () => !this.faltaTienda() && !this.faltaEntrega() && !this.faltaDescripcion() && !this.prohibido() && !this.errorValor(),
  );

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
    if (this.buscando() === 'tienda') this.pedido.tienda.set(l);
    else {
      this.pedido.entrega.set(l);
      this.lugares.recordar(l);
    }
    this.buscando.set(null);
  }

  elegirCategoria(c: Categoria): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.pedido.categoria.set(this.pedido.categoria() === c ? null : c);
  }

  elegirPagador(domiciliario: boolean): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.pedido.pagaDomiciliario.set(domiciliario);
  }

  /** Solo números; se muestra con puntos de miles ("28.000"). */
  escribirValor(texto: string): string {
    const n = Number(texto.replace(/\D/g, '').slice(0, 9)) || null;
    this.pedido.valorPedido.set(n);
    return n ? new Intl.NumberFormat('es-CO').format(n) : '';
  }

  valorVisible(): string {
    const v = this.pedido.valorPedido();
    return v ? new Intl.NumberFormat('es-CO').format(v) : '';
  }

  verTarifa(): void {
    if (!this.listo()) {
      this.intento.set(true);
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
      return;
    }
    if (!this.pedido.entrega()) {
      const u = this.gps.ubicacion()!;
      this.pedido.entrega.set({ nombre: 'Mi ubicación', detalle: u.direccion, barrio: u.barrio, lat: u.lat, lng: u.lng });
    }
    this.nav.navigateForward('/cliente/domicilio/confirmar');
  }
}
