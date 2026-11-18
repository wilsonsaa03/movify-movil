import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonContent, IonFooter, NavController, ToastController, ViewDidEnter } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { pesos, urlFoto } from '../../../../core/formato';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { BarraCarritoComponent } from '../../../../componentes/barra-carrito/barra-carrito.component';
import { FichaProductoComponent, ProductoElegido } from '../../../../componentes/ficha-producto/ficha-producto.component';
import { CatalogoDomicilioService, ComercioDetalle, Producto, horaBonita } from '../../../../servicios/catalogo-domicilio.service';

/**
 * Tienda de un comercio aliado (?id=comercio). Encabezado con el estado (abierto / "abre a las…"), tiempo,
 * pedido mínimo y +18; buscador dentro de la tienda; secciones ("Hamburguesas", "Bebidas") que llevan a su parte de
 * la lista; productos con foto, descripción y precio (agotados en gris). Tocar un producto abre su ficha.
 * Un carrito = un comercio: si ya tiene productos de otro, se pregunta antes de vaciarlo.
 */
@Component({
  selector: 'app-domicilio-tienda',
  templateUrl: 'domicilio-tienda.page.html',
  styleUrls: ['domicilio-tienda.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, BarraCarritoComponent, FichaProductoComponent],
})
export class DomicilioTiendaPage implements ViewDidEnter {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly alertas = inject(AlertController);
  private readonly avisos = inject(ToastController);
  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');
  readonly cat = inject(CatalogoDomicilioService);

  readonly tienda = signal<ComercioDetalle | null>(null);
  readonly error = signal('');
  readonly texto = signal('');
  readonly abierta = signal<Producto | null>(null);
  readonly pesos = pesos;
  readonly urlFoto = urlFoto;
  readonly horaBonita = horaBonita;

  /** Secciones filtradas por el buscador de la tienda. */
  readonly secciones = computed(() => {
    const t = this.tienda();
    if (!t) return [];
    const q = this.texto().trim().toLowerCase();
    if (!q) return t.secciones;
    return t.secciones
      .map((s) => ({ ...s, productos: s.productos.filter((p) => `${p.nombre} ${p.descripcion ?? ''}`.toLowerCase().includes(q)) }))
      .filter((s) => s.productos.length);
  });
  /** Cuántas unidades de cada producto hay ya en el carrito (para el contador en la fila). */
  readonly enCarrito = computed(() => {
    const m = new Map<number, number>();
    const c = this.cat.carrito();
    if (c && c.comercio.id === this.tienda()?.id) c.lineas.forEach((l) => m.set(l.producto_id, (m.get(l.producto_id) ?? 0) + l.cantidad));
    return m;
  });

  ionViewDidEnter(): void {
    const id = Number(this.ruta.snapshot.queryParamMap.get('id'));
    if (!id) {
      this.nav.navigateRoot('/cliente/domicilio');
      return;
    }
    this.cargar(id);
  }

  volver(): void {
    this.nav.back();
  }

  async cargar(id: number): Promise<void> {
    this.error.set('');
    try {
      const e = this.cat.entrega();
      this.tienda.set(await this.cat.comercio(id, e?.lat, e?.lng));
    } catch (err) {
      this.error.set((err as ErrorApi).message || 'No pudimos abrir la tienda.');
    }
  }

  irA(seccion: string): void {
    const el = this.lista()?.nativeElement.querySelector<HTMLElement>(`[data-seccion="${CSS.escape(seccion)}"]`);
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  }

  abrir(p: Producto): void {
    this.abierta.set(p);
  }

  /** Viene de la ficha: valida "un comercio por carrito" y agrega. */
  async agregar(p: Producto, e: ProductoElegido): Promise<void> {
    const t = this.tienda()!;
    if (this.cat.esDeOtroComercio(t.id)) {
      const otro = this.cat.carrito()!.comercio.nombre;
      const a = await this.alertas.create({
        header: '¿Empezar un carrito nuevo?',
        message: `Tu carrito tiene productos de ${otro}. Cada pedido es de un solo comercio.`,
        buttons: [
          { text: 'Seguir con el otro', role: 'cancel' },
          { text: 'Vaciar y agregar', role: 'confirm' },
        ],
      });
      await a.present();
      if ((await a.onDidDismiss()).role !== 'confirm') return;
      this.cat.vaciar();
    }
    this.cat.agregar(
      { id: t.id, nombre: t.nombre, categoria: t.categoria, pedido_minimo: Number(t.pedido_minimo), foto_url: t.foto_url },
      {
        producto_id: p.id,
        nombre: p.nombre,
        foto_url: p.foto_url,
        solo_mayores: p.solo_mayores || t.categoria === 'licores',
        precio_unitario: e.precioUnitario,
        cantidad: e.cantidad,
        opciones: e.opciones,
        nota: e.nota,
      },
    );
    this.abierta.set(null);
    Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    const t2 = await this.avisos.create({ message: `${e.cantidad} × ${p.nombre} en tu carrito`, duration: 1600, position: 'top', color: 'dark' });
    await t2.present();
  }
}
