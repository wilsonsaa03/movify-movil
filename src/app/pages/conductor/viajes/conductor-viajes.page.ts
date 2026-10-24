import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { ApiService, ErrorApi } from '../../../core/api.service';
import { SesionService } from '../../../core/sesion.service';
import { pesos } from '../../../core/formato';
import { IconoComponent, NombreIcono } from '../../../componentes/icono/icono.component';
import { BarraInferiorComponent } from '../../../componentes/barra-inferior/barra-inferior.component';
import { hora } from '../../../servicios/encomienda.service';
import { fechaHora } from '../../../servicios/historial.service';
import { BARRA_CONDUCTOR } from '../inicio/conductor-inicio.page';

type Periodo = 'hoy' | 'semana' | 'mes';

/** GET /api/transporte/historial-conductor/{id} (campos que usa la lista). */
interface ViajeHistorial {
  servicio_id: number;
  estado_codigo: string;
  fecha_solicitud: string;
  origen_direccion: string;
  destino_direccion: string;
  tarifa: number;
  tipo: string;
  tipo_vehiculo: string;
}

/** GET /api/transporte/ganancias-stats/{id} */
interface Ganancias {
  ganancias_hoy: number;
  viajes_hoy: number;
  ganancias_semana: number;
  viajes_semana: number;
  ganancias_mes: number;
  viajes_mes: number;
}

/**
 * Conductor app 9 · Mis viajes. Hoy / Semana / Mes con lo ganado (en efectivo), cuántos viajes y la lista
 * (hora, de dónde a dónde, estado y valor). Tocar un viaje en curso lo retoma.
 */
@Component({
  selector: 'app-conductor-viajes',
  templateUrl: 'conductor-viajes.page.html',
  styleUrls: ['conductor-viajes.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, BarraInferiorComponent],
})
export class ConductorViajesPage implements ViewDidEnter {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly nav = inject(NavController);

  readonly barra = BARRA_CONDUCTOR;
  readonly periodos: { id: Periodo; nombre: string }[] = [
    { id: 'hoy', nombre: 'Hoy' },
    { id: 'semana', nombre: 'Semana' },
    { id: 'mes', nombre: 'Mes' },
  ];
  readonly periodo = signal<Periodo>('hoy');
  readonly lista = signal<ViajeHistorial[]>([]);
  readonly ganancias = signal<Ganancias | null>(null);
  readonly cargando = signal(true);
  readonly error = signal('');
  readonly pesos = pesos;

  readonly ganado = computed(() => {
    const g = this.ganancias();
    if (!g) return { valor: 0, viajes: 0 };
    const p = this.periodo();
    return p === 'hoy'
      ? { valor: Number(g.ganancias_hoy), viajes: Number(g.viajes_hoy) }
      : p === 'semana'
        ? { valor: Number(g.ganancias_semana), viajes: Number(g.viajes_semana) }
        : { valor: Number(g.ganancias_mes), viajes: Number(g.viajes_mes) };
  });
  readonly rotulo = computed(() => ({ hoy: 'Ganado hoy', semana: 'Ganado esta semana', mes: 'Ganado este mes' })[this.periodo()]);

  ionViewDidEnter(): void {
    this.cargar();
  }

  elegir(p: Periodo): void {
    if (p === this.periodo()) return;
    this.periodo.set(p);
    this.cargar();
  }

  hora(iso: string): string {
    return hora(iso);
  }

  /** Semana y mes: "jue 23 oct · 6:48 p. m." (con solo la hora no se sabe de qué día es). */
  readonly fechaHora = fechaHora;

  /** "Cra 3 #5-20, La Playita" → "Cra 3 #5-20" (la lista es angosta). */
  corto(texto: string): string {
    return (texto ?? '').split(',')[0];
  }

  icono(v: ViajeHistorial): NombreIcono {
    if (v.tipo === 'DOMICILIO') return 'domicilio';
    if (v.tipo === 'ENCOMIENDA') return 'encomienda';
    return v.tipo_vehiculo === 'taxi' ? 'taxi' : 'moto';
  }

  estado(v: ViajeHistorial): { texto: string; clase: string } {
    switch (v.estado_codigo) {
      case 'finalizado':
        return { texto: 'Finalizado', clase: 'ok' };
      case 'cancelado':
      case 'expirado':
        return { texto: 'Cancelado', clase: 'mal' };
      default:
        return { texto: 'En curso', clase: 'curso' };
    }
  }

  abrir(v: ViajeHistorial): void {
    const rutas: Record<string, string> = {
      asignado: '/conductor/viaje/recogida',
      en_origen: v.tipo === 'TRANSPORTE' ? '/conductor/viaje/pin' : '/conductor/viaje/en-curso',
      en_curso: '/conductor/viaje/en-curso',
    };
    const r = rutas[v.estado_codigo];
    if (r) this.nav.navigateRoot(r, { queryParams: { id: v.servicio_id } });
  }

  private async cargar(): Promise<void> {
    const id = this.sesion.datos()?.id;
    if (!id) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const [historial, ganancias] = await Promise.all([
        this.api.get<{ viajes: ViajeHistorial[] }>(`/transporte/historial-conductor/${id}?filtro=${this.periodo()}&limite=50`),
        this.api.get<Ganancias>(`/transporte/ganancias-stats/${id}`),
      ]);
      this.lista.set(historial.viajes);
      this.ganancias.set(ganancias);
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos cargar tus viajes.');
    } finally {
      this.cargando.set(false);
    }
  }
}
