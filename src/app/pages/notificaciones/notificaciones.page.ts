import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonRefresher, IonRefresherContent, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../core/api.service';
import { rutaDelAviso } from '../../core/push.service';
import { IconoComponent, NombreIcono } from '../../componentes/icono/icono.component';
import { Notificacion, NotificacionesService, grupoDia, haceCuanto } from '../../servicios/notificaciones.service';

type Rol = 'cliente' | 'conductor';
type Filtro = 'todas' | 'no-leidas';

/**
 * Notificaciones (la campana del inicio). Lo que le llegó por push, guardado para verlo después: conductor
 * asignado, llegó, terminó, mensajes del chat, respuestas de soporte, viajes programados… agrupado por día, con las
 * no leídas resaltadas. Tocar una la marca como leída y lleva a su pantalla (la misma regla que el push).
 * La usan el cliente y el conductor (data.rol). Sin frame en el Figma: sigue el estilo de las pantallas del cliente.
 */
@Component({
  selector: 'app-notificaciones',
  templateUrl: 'notificaciones.page.html',
  styleUrls: ['notificaciones.page.scss'],
  imports: [IonContent, IonRefresher, IonRefresherContent, IconoComponent],
})
export class NotificacionesPage implements ViewDidEnter {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  readonly servicio = inject(NotificacionesService);

  readonly rol: Rol = this.ruta.snapshot.data['rol'] === 'conductor' ? 'conductor' : 'cliente';
  readonly items = signal<Notificacion[]>([]);
  readonly filtro = signal<Filtro>('todas');
  readonly cargando = signal(true);
  readonly cargandoMas = signal(false);
  readonly hayMas = signal(false);
  readonly marcando = signal(false);
  readonly error = signal('');
  private pagina = 0;

  readonly visibles = computed(() => (this.filtro() === 'no-leidas' ? this.items().filter((n) => !n.leida_en) : this.items()));

  /** Agrupadas por día ("Hoy", "Ayer", "mar. 21 oct."), ya filtradas. */
  readonly grupos = computed(() => {
    const grupos: { dia: string; items: Notificacion[] }[] = [];
    for (const n of this.visibles()) {
      const d = grupoDia(n.creado_en);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.dia === d) ultimo.items.push(n);
      else grupos.push({ dia: d, items: [n] });
    }
    return grupos;
  });

  readonly hace = haceCuanto;

  ionViewDidEnter(): void {
    this.cargar(true);
  }

  volver(): void {
    this.nav.navigateBack(this.rol === 'conductor' ? '/conductor/inicio' : '/cliente');
  }

  async refrescar(e: CustomEvent): Promise<void> {
    await this.cargar(true);
    (e.target as HTMLIonRefresherElement).complete();
  }

  async verMas(): Promise<void> {
    if (this.cargandoMas()) return;
    this.cargandoMas.set(true);
    try {
      const r = await this.servicio.pagina(this.pagina + 1);
      this.pagina++;
      this.items.update((l) => [...l, ...r.items]);
      this.hayMas.set(r.hay_mas);
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos cargar más.');
    } finally {
      this.cargandoMas.set(false);
    }
  }

  async leerTodas(): Promise<void> {
    if (this.marcando() || !this.servicio.noLeidas()) return;
    this.marcando.set(true);
    try {
      await this.servicio.leerTodas();
      const ahora = new Date().toISOString();
      this.items.update((l) => l.map((n) => (n.leida_en ? n : { ...n, leida_en: ahora })));
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos marcarlas como leídas.');
    } finally {
      this.marcando.set(false);
    }
  }

  /** Tocar: se marca leída (sin esperar) y se va a la pantalla del aviso. */
  abrir(n: Notificacion): void {
    if (!n.leida_en) {
      this.items.update((l) => l.map((x) => (x.id === n.id ? { ...x, leida_en: new Date().toISOString() } : x)));
      this.servicio.leida(n.id).catch(() => undefined);
    }
    const destino = rutaDelAviso({ evento: n.evento ?? undefined, servicio_id: n.servicio_id ? String(n.servicio_id) : undefined }, this.rol === 'conductor');
    if (destino) this.nav.navigateForward(destino.ruta, { queryParams: destino.params });
  }

  /** Ícono y color según lo que avisa. */
  icono(n: Notificacion): { nombre: NombreIcono; tono: string } {
    switch (n.evento) {
      case 'mensaje':
        return { nombre: 'mensaje', tono: 'teal' };
      case 'soporte':
        return { nombre: 'escudo', tono: 'azul' };
      case 'cancelado':
      case 'expirado':
        return { nombre: 'x', tono: 'rojo' };
      case 'finalizado':
        return { nombre: 'check', tono: 'verde' };
      case 'programado':
        return { nombre: 'reloj', tono: 'naranja' };
      case 'destino':
        return { nombre: 'pin', tono: 'naranja' };
      case 'solicitud':
        return { nombre: n.tipo_vehiculo === 'taxi' ? 'taxi' : 'moto', tono: 'amarillo' };
    }
    if (n.tipo === 'sos') return { nombre: 'alerta', tono: 'rojo' };
    if (n.tipo_servicio === 'domicilio') return { nombre: 'domicilio', tono: 'naranja' };
    if (n.tipo_servicio === 'encomienda') return { nombre: 'encomienda', tono: 'naranja' };
    return { nombre: n.tipo_vehiculo === 'taxi' ? 'taxi' : n.tipo_vehiculo === 'moto' ? 'moto' : 'campana', tono: 'amarillo' };
  }

  private async cargar(desdeCero: boolean): Promise<void> {
    if (desdeCero) this.pagina = 0;
    this.cargando.set(true);
    this.error.set('');
    try {
      const r = await this.servicio.pagina(0);
      this.items.set(r.items);
      this.hayMas.set(r.hay_mas);
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos cargar tus notificaciones.');
    } finally {
      this.cargando.set(false);
    }
  }
}
