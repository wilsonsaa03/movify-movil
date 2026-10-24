import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonFooter, IonRefresher, IonRefresherContent, NavController, ViewDidEnter } from '@ionic/angular';
import { ErrorApi } from '../../../core/api.service';
import { pesos } from '../../../core/formato';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { BarraInferiorComponent } from '../../../componentes/barra-inferior/barra-inferior.component';
import { hora } from '../../../servicios/encomienda.service';
import { HistorialService, Pedido, claseEstado, dia, iconoServicio, nombreServicio, seguimiento } from '../../../servicios/historial.service';
import { BARRA_CLIENTE } from '../inicio/cliente-inicio.page';

type Filtro = 'todos' | 'transporte' | 'domicilio' | 'encomienda';

/**
 * Mis pedidos (HU 2.9). Sin frame en el Figma: sigue el estilo de la app del cliente.
 * Todos sus servicios, del más reciente al más viejo y agrupados por día: qué fue, de dónde a dónde, el estado
 * final, la hora y el valor. Filtro por tipo y resumen del mes. Tocar uno abre su detalle con la línea de tiempo
 * (o el seguimiento, si sigue en curso).
 */
@Component({
  selector: 'app-cliente-pedidos',
  templateUrl: 'cliente-pedidos.page.html',
  styleUrls: ['cliente-pedidos.page.scss'],
  imports: [IonContent, IonFooter, IonRefresher, IonRefresherContent, IconoComponent, BarraInferiorComponent],
})
export class ClientePedidosPage implements ViewDidEnter {
  private readonly historial = inject(HistorialService);
  private readonly nav = inject(NavController);

  readonly barra = BARRA_CLIENTE;
  readonly filtros: { id: Filtro; nombre: string }[] = [
    { id: 'todos', nombre: 'Todos' },
    { id: 'transporte', nombre: 'Viajes' },
    { id: 'domicilio', nombre: 'Domicilios' },
    { id: 'encomienda', nombre: 'Encomiendas' },
  ];
  readonly filtro = signal<Filtro>('todos');
  readonly pedidos = signal<Pedido[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');
  readonly pesos = pesos;
  readonly hora = hora;
  readonly nombre = nombreServicio;
  readonly icono = iconoServicio;
  readonly clase = claseEstado;

  /** Agrupados por día ("Hoy", "Ayer", "jue 23 oct"), ya filtrados. */
  readonly grupos = computed(() => {
    const f = this.filtro();
    const lista = this.pedidos().filter((p) => f === 'todos' || p.tipo_servicio === f);
    const grupos: { dia: string; pedidos: Pedido[] }[] = [];
    for (const p of lista) {
      const d = dia(p.fecha_solicitud);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.dia === d) ultimo.pedidos.push(p);
      else grupos.push({ dia: d, pedidos: [p] });
    }
    return grupos;
  });
  /** Este mes: cuántos servicios terminados y cuánto pagó en efectivo. */
  readonly mes = computed(() => {
    const hoy = new Date();
    const delMes = this.pedidos().filter((p) => {
      const f = new Date(p.fecha_solicitud);
      return p.estado_codigo === 'finalizado' && f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
    });
    return { cantidad: delMes.length, total: delMes.reduce((s, p) => s + (Number(p.tarifa) || 0), 0) };
  });

  readonly textoVacio = computed(
    () =>
      ({
        todos: 'Todavía no has pedido nada',
        transporte: 'Todavía no tienes viajes',
        domicilio: 'Todavía no tienes domicilios',
        encomienda: 'Todavía no tienes encomiendas',
      })[this.filtro()],
  );

  ionViewDidEnter(): void {
    this.cargar();
  }

  async refrescar(e: CustomEvent): Promise<void> {
    await this.cargar();
    (e.target as HTMLIonRefresherElement).complete();
  }

  abrir(p: Pedido): void {
    const ruta = seguimiento(p);
    if (ruta) this.nav.navigateForward(ruta, { queryParams: { id: p.id } });
    else this.nav.navigateForward('/cliente/pedidos/detalle', { queryParams: { id: p.id } });
  }

  pedirAlgo(): void {
    this.nav.navigateRoot('/cliente', { animationDirection: 'back' });
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.pedidos.set(await this.historial.mios());
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos cargar tus pedidos.');
    } finally {
      this.cargando.set(false);
    }
  }
}
