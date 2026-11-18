import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { pesos, urlFoto } from '../../../../core/formato';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { BuscadorLugarComponent } from '../../../../componentes/buscador-lugar/buscador-lugar.component';
import { BarraCarritoComponent } from '../../../../componentes/barra-carrito/barra-carrito.component';
import { Lugar, LugaresService } from '../../../../servicios/lugares.service';
import { UbicacionService } from '../../../../servicios/ubicacion.service';
import { CATEGORIAS_COMERCIO, CatalogoDomicilioService, CategoriaComercio, Comercio, horaBonita } from '../../../../servicios/catalogo-domicilio.service';

/** Espera tras la última letra antes de buscar (no se pide al backend en cada tecla). */
const ESPERA_BUSQUEDA_MS = 350;

/**
 * Domicilios · inicio (estilo Rappi, con la estética de las pantallas de Domicilio y Encomienda).
 * ENTREGAR EN (GPS o lugar guardado), buscador de comercios y productos, categorías, "Pídelo como quieras"
 * (el pedido libre de siempre) y los comercios aliados: abiertos primero, con tiempo, distancia y pedido mínimo.
 * Los cerrados salen en gris con "Abre a las…". Si hay carrito, la barra "Ver carrito" queda abajo.
 */
@Component({
  selector: 'app-domicilio-inicio',
  templateUrl: 'domicilio-inicio.page.html',
  styleUrls: ['domicilio-inicio.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, BuscadorLugarComponent, BarraCarritoComponent],
})
export class DomicilioInicioPage implements ViewDidEnter, ViewWillLeave {
  private readonly nav = inject(NavController);
  private readonly gps = inject(UbicacionService);
  private readonly lugares = inject(LugaresService);
  readonly cat = inject(CatalogoDomicilioService);

  readonly categorias = CATEGORIAS_COMERCIO;
  readonly pesos = pesos;
  readonly urlFoto = urlFoto;
  readonly horaBonita = horaBonita;

  readonly categoria = signal<CategoriaComercio | null>(null);
  readonly texto = signal('');
  readonly comercios = signal<Comercio[] | null>(null);
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly eligiendoEntrega = signal(false);
  private espera?: ReturnType<typeof setTimeout>;
  private consulta = 0;

  /** ENTREGAR EN: lo elegido o, si no, el GPS (igual que el pedido libre). */
  readonly entregar = computed<{ titulo: string; detalle: string | null } | null>(() => {
    const e = this.cat.entrega();
    if (e) return { titulo: e.nombre === 'Mi ubicación' && e.detalle ? `Mi ubicación · ${e.detalle}` : e.nombre, detalle: e.barrio };
    const u = this.gps.ubicacion();
    if (!u) return null;
    return { titulo: u.direccion ? `Mi ubicación · ${u.direccion}` : 'Mi ubicación', detalle: u.barrio };
  });
  /** Punto para calcular distancia y cobertura: lo elegido o el GPS. */
  private readonly punto = computed(() => {
    const e = this.cat.entrega();
    if (e) return { lat: e.lat, lng: e.lng };
    const u = this.gps.ubicacion();
    return u ? { lat: u.lat, lng: u.lng } : null;
  });
  readonly abiertos = computed(() => (this.comercios() ?? []).filter((c) => c.abierto));
  readonly cerrados = computed(() => (this.comercios() ?? []).filter((c) => !c.abierto));

  constructor() {
    // Cambia la dirección (o llega el GPS) → se recalcula qué comercios entregan ahí
    effect(() => {
      const p = this.punto();
      untracked(() => this.buscar(p));
    });
  }

  ionViewDidEnter(): void {
    this.gps.seguir();
    this.buscar(this.punto());
  }

  ionViewWillLeave(): void {
    this.gps.dejarDeSeguir();
    clearTimeout(this.espera);
  }

  volver(): void {
    this.nav.back();
  }

  escribir(t: string): void {
    this.texto.set(t);
    clearTimeout(this.espera);
    this.espera = setTimeout(() => this.buscar(this.punto()), ESPERA_BUSQUEDA_MS);
  }

  elegirCategoria(c: CategoriaComercio | null): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.categoria.set(c);
    this.buscar(this.punto());
  }

  entregaElegida(l: Lugar): void {
    this.cat.entrega.set(l);
    this.lugares.recordar(l);
    this.eligiendoEntrega.set(false);
  }

  abrir(c: Comercio): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.fijarEntrega();
    this.nav.navigateForward('/cliente/domicilio/tienda', { queryParams: { id: c.id } });
  }

  /** El pedido libre de siempre: cualquier cosa de cualquier tienda o una diligencia. */
  pedidoLibre(): void {
    this.nav.navigateForward('/cliente/domicilio/libre');
  }

  inicial(c: Comercio): string {
    return c.nombre.trim().charAt(0).toUpperCase();
  }

  /** Antes de entrar a una tienda se deja fija la entrega (si venía del GPS). */
  private fijarEntrega(): void {
    if (this.cat.entrega()) return;
    const u = this.gps.ubicacion();
    if (u) this.cat.entrega.set({ nombre: 'Mi ubicación', detalle: u.direccion, barrio: u.barrio, lat: u.lat, lng: u.lng });
  }

  private async buscar(p: { lat: number; lng: number } | null): Promise<void> {
    const n = ++this.consulta;
    this.cargando.set(true);
    this.error.set('');
    try {
      const r = await this.cat.comercios({ categoria: this.categoria(), q: this.texto(), lat: p?.lat, lng: p?.lng });
      if (n === this.consulta) this.comercios.set(r);
    } catch (e) {
      if (n === this.consulta) this.error.set((e as ErrorApi).message || 'No pudimos cargar los comercios.');
    } finally {
      if (n === this.consulta) this.cargando.set(false);
    }
  }
}
