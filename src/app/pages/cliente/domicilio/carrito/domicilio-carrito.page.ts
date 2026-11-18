import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService, ErrorApi } from '../../../../core/api.service';
import { pesos } from '../../../../core/formato';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { BuscadorLugarComponent } from '../../../../componentes/buscador-lugar/buscador-lugar.component';
import { FormaPagoComponent } from '../../../../componentes/forma-pago/forma-pago.component';
import { Lugar, LugaresService } from '../../../../servicios/lugares.service';
import { PagosService } from '../../../../servicios/pagos.service';
import { UbicacionService } from '../../../../servicios/ubicacion.service';
import { contenidoProhibido } from '../../../../servicios/contenido-prohibido';
import { CatalogoDomicilioService, Cotizacion, LineaCarrito } from '../../../../servicios/catalogo-domicilio.service';

/** Espera tras el último cambio antes de volver a cotizar (cantidades, cupón, dirección). */
const ESPERA_COTIZAR_MS = 350;

/**
 * Carrito y confirmación del domicilio con catálogo (Rappi: canasta + checkout en una sola pantalla).
 * Líneas con − cantidad + (en 0 se quita), opciones y nota; ENTREGAR EN; instrucciones; cupón; cómo vas a pagar;
 * desglose que calcula el BACKEND (productos, descuento, domicilio, total) y los problemas que impiden pedir
 * (cerrado, agotado, mínimo, cobertura, +18). "Pedir domicilio" crea el pedido y lleva a "Buscando domiciliario".
 * Se paga al terminar: el domiciliario paga en el comercio y tú le pagas a él (o por la app).
 */
@Component({
  selector: 'app-domicilio-carrito',
  templateUrl: 'domicilio-carrito.page.html',
  styleUrls: ['domicilio-carrito.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, BuscadorLugarComponent, FormaPagoComponent],
})
export class DomicilioCarritoPage implements ViewDidEnter, ViewWillLeave {
  private readonly nav = inject(NavController);
  private readonly api = inject(ApiService);
  private readonly gps = inject(UbicacionService);
  private readonly lugares = inject(LugaresService);
  private readonly pagos = inject(PagosService);
  readonly cat = inject(CatalogoDomicilioService);

  readonly pesos = pesos;
  readonly cot = signal<Cotizacion | null>(null);
  readonly cotizando = signal(false);
  readonly pidiendo = signal(false);
  readonly error = signal('');
  readonly cuponEscrito = signal(this.cat.cupon());
  readonly eligiendoEntrega = signal(false);
  readonly mayorEdad = signal(false);
  readonly intento = signal(false);
  private espera?: ReturnType<typeof setTimeout>;
  private consulta = 0;

  readonly entregar = computed<{ titulo: string; detalle: string | null } | null>(() => {
    const e = this.cat.entrega();
    if (e) return { titulo: e.nombre === 'Mi ubicación' && e.detalle ? `Mi ubicación · ${e.detalle}` : e.nombre, detalle: e.barrio };
    const u = this.gps.ubicacion();
    if (!u) return null;
    return { titulo: u.direccion ? `Mi ubicación · ${u.direccion}` : 'Mi ubicación', detalle: u.barrio };
  });
  readonly instruccionesProhibidas = computed(() => contenidoProhibido(this.cat.instrucciones()));
  readonly pideMayorEdad = computed(() => !!this.cot()?.solo_mayores && !this.cot()?.mayor_edad_confirmado);
  /** Errores del backend menos el de +18, que se resuelve con la casilla de aquí. */
  readonly errores = computed(() => (this.cot()?.errores ?? []).filter((e) => !e.includes('mayor de edad') || !this.mayorEdad()));
  readonly puedePedir = computed(
    () =>
      !!this.cot() &&
      !this.cotizando() &&
      !this.errores().length &&
      !this.instruccionesProhibidas() &&
      (!this.pideMayorEdad() || this.mayorEdad()) &&
      (!this.cat.cupon() || !!this.cot()?.cupon?.valido),
  );

  constructor() {
    // Cualquier cambio en el carrito, la entrega, el cupón aplicado o el medio de pago → se vuelve a cotizar
    effect(() => {
      this.cat.carrito();
      this.cat.entrega();
      this.cat.cupon();
      this.pagos.preferida();
      untracked(() => this.programarCotizacion());
    });
  }

  ionViewDidEnter(): void {
    this.gps.seguir();
    if (!this.cat.entrega()) {
      const u = this.gps.ubicacion();
      if (u) this.cat.entrega.set({ nombre: 'Mi ubicación', detalle: u.direccion, barrio: u.barrio, lat: u.lat, lng: u.lng });
    }
    this.programarCotizacion(0);
  }

  ionViewWillLeave(): void {
    this.gps.dejarDeSeguir();
    clearTimeout(this.espera);
  }

  volver(): void {
    this.nav.back();
  }

  seguirComprando(): void {
    const c = this.cat.carrito();
    if (c) this.nav.navigateBack('/cliente/domicilio/tienda', { queryParams: { id: c.comercio.id } });
    else this.nav.navigateRoot('/cliente/domicilio');
  }

  cantidad(l: LineaCarrito, n: number): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.cat.cambiarCantidad(l.clave, n);
  }

  /** Precio que dice el backend para esa línea (si ya cotizó), si no el que vio en la tienda. */
  totalLinea(l: LineaCarrito, i: number): number {
    const c = this.cot()?.lineas[i];
    return c && c.producto_id === l.producto_id ? Number(c.total_linea) : l.precio_unitario * l.cantidad;
  }

  problemas(i: number): string[] {
    return this.cot()?.lineas[i]?.problemas ?? [];
  }

  opcionesTexto(l: LineaCarrito): string {
    return l.opciones.map((o) => o.nombre).join(', ');
  }

  aplicarCupon(): void {
    this.cat.cupon.set(this.cuponEscrito().trim().toUpperCase());
  }

  quitarCupon(): void {
    this.cuponEscrito.set('');
    this.cat.cupon.set('');
  }

  entregaElegida(l: Lugar): void {
    this.cat.entrega.set(l);
    this.lugares.recordar(l);
    this.eligiendoEntrega.set(false);
  }

  async pedir(): Promise<void> {
    if (this.pidiendo()) return;
    if (!this.puedePedir()) {
      this.intento.set(true);
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
      return;
    }
    this.pidiendo.set(true);
    this.error.set('');
    try {
      const r = await this.cat.pedir(Number(this.cot()!.subtotal), this.mayorEdad());
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
      this.nav.navigateRoot('/cliente/viaje/buscando', { queryParams: { id: r.id } });
    } catch (e) {
      const err = e as ErrorApi;
      this.error.set(err.message || 'No pudimos pedir tu domicilio. Intenta de nuevo.');
      // Cambió algo (precio, agotado, cerró): se muestra el carrito actualizado
      this.programarCotizacion(0);
    } finally {
      this.pidiendo.set(false);
    }
  }

  private programarCotizacion(ms = ESPERA_COTIZAR_MS): void {
    clearTimeout(this.espera);
    if (!this.cat.carrito() || !this.cat.entrega()) {
      this.cot.set(null);
      return;
    }
    this.cotizando.set(true);
    this.espera = setTimeout(() => this.cotizar(), ms);
  }

  private async cotizar(): Promise<void> {
    const n = ++this.consulta;
    try {
      const c = await this.cat.cotizar();
      if (n !== this.consulta) return;
      this.cot.set(c);
      if (!this.error().startsWith('Algunos precios')) this.error.set('');
    } catch (e) {
      if (n === this.consulta) this.error.set((e as ErrorApi).message || 'No pudimos calcular tu pedido.');
    } finally {
      if (n === this.consulta) this.cotizando.set(false);
    }
  }

  /** Si ya tenía un pedido andando (409 del backend), se puede ver ese. */
  async verActivo(): Promise<void> {
    const activo = await this.api.get<{ id: number; estado_codigo: string } | null>('/servicios/activo').catch(() => null);
    if (activo?.id) this.nav.navigateRoot('/cliente/domicilio/seguimiento', { queryParams: { id: activo.id } });
  }
}
