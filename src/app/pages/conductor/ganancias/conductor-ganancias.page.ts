import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonFooter, IonRefresher, IonRefresherContent, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../../core/api.service';
import { pesos } from '../../../core/formato';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { BarraInferiorComponent } from '../../../componentes/barra-inferior/barra-inferior.component';
import {
  BarraGanancias,
  GananciasService,
  META_MAX,
  META_MIN,
  PeriodoGanancias,
  ResumenGanancias,
  duracion,
  esBarraActual,
  etiquetaBarra,
  nombreBarra,
  tipoGanancia,
} from '../../../servicios/ganancias.service';
import { BARRA_CONDUCTOR } from '../inicio/conductor-inicio.page';

/**
 * Ganancias del conductor (barra inferior). Hoy / Semana / Mes: lo cobrado, la comparación con el periodo anterior
 * hasta la misma hora, la gráfica (bloques de 3 horas o días; tocar una barra muestra su valor), la meta del día
 * (la elige él y se ve en el inicio), el desglose por tipo y cuántos km y tiempo de viaje.
 * Todo es efectivo: no hay saldo ni retiros. Sin frame en el Figma: sigue el estilo de "Mis viajes".
 */
@Component({
  selector: 'app-conductor-ganancias',
  templateUrl: 'conductor-ganancias.page.html',
  styleUrls: ['conductor-ganancias.page.scss'],
  imports: [IonContent, IonFooter, IonRefresher, IonRefresherContent, IconoComponent, BarraInferiorComponent],
})
export class ConductorGananciasPage implements ViewDidEnter {
  private readonly ganancias = inject(GananciasService);
  private readonly nav = inject(NavController);

  readonly barra = BARRA_CONDUCTOR;
  readonly periodos: { id: PeriodoGanancias; nombre: string }[] = [
    { id: 'hoy', nombre: 'Hoy' },
    { id: 'semana', nombre: 'Semana' },
    { id: 'mes', nombre: 'Mes' },
  ];
  readonly periodo = signal<PeriodoGanancias>('hoy');
  readonly resumen = signal<ResumenGanancias | null>(null);
  readonly cargando = signal(true);
  readonly error = signal('');
  /** Barra tocada (índice) para ver su valor; null = el total del periodo. */
  readonly elegida = signal<number | null>(null);
  readonly editandoMeta = signal(false);
  readonly meta = this.ganancias.meta;
  readonly metaMin = META_MIN;
  readonly metaMax = META_MAX;

  readonly pesos = pesos;
  readonly duracion = duracion;
  readonly tipo = tipoGanancia;
  private pedido = 0;

  readonly rotulo = computed(() => ({ hoy: 'Ganado hoy', semana: 'Ganado esta semana', mes: 'Ganado este mes' })[this.periodo()]);
  readonly contra = computed(() => ({ hoy: 'ayer a esta hora', semana: 'la semana pasada', mes: 'el mes pasado' })[this.periodo()]);

  readonly tendencia = computed(() => {
    const r = this.resumen();
    if (!r || r.tendencia === null || r.tendencia === undefined) return null;
    const t = Number(r.tendencia);
    return { valor: Math.abs(t), sube: t > 0, baja: t < 0 };
  });

  /** Alto de cada barra (0–1) contra la más alta; mínimo visible para las que tienen algo. */
  readonly columnas = computed(() => {
    const r = this.resumen();
    if (!r) return [];
    const max = Math.max(...r.barras.map((b) => Number(b.valor)), 0);
    return r.barras.map((b) => {
      const v = Number(b.valor);
      return {
        b,
        alto: max > 0 && v > 0 ? Math.max(0.06, v / max) : 0,
        etiqueta: etiquetaBarra(b.desde, this.periodo()),
        actual: esBarraActual(b.desde, this.periodo()),
        nombre: nombreBarra(b.desde, this.periodo()),
      };
    });
  });

  readonly detalleBarra = computed(() => {
    const i = this.elegida();
    const c = i === null ? null : this.columnas()[i];
    return c ? { nombre: c.nombre, valor: Number(c.b.valor), viajes: Number(c.b.viajes) } : null;
  });

  /** Mejor día / franja del periodo (solo si hubo algo). */
  readonly mejor = computed(() => {
    const cols = this.columnas();
    let mejor: (typeof cols)[number] | null = null;
    for (const c of cols) if (Number(c.b.valor) > 0 && (!mejor || Number(c.b.valor) > Number(mejor.b.valor))) mejor = c;
    return mejor && this.periodo() !== 'hoy' ? { nombre: mejor.nombre, valor: Number(mejor.b.valor) } : null;
  });

  readonly totalTipos = computed(() => (this.resumen()?.por_tipo ?? []).reduce((s, t) => s + Number(t.valor), 0));

  readonly avanceMeta = computed(() => Math.min(1, Number(this.resumen()?.total ?? 0) / this.meta()));
  readonly textoMeta = computed(() => {
    const falta = this.meta() - Number(this.resumen()?.total ?? 0);
    return falta > 0 ? `Te faltan ${pesos(falta)}` : '¡Cumpliste tu meta de hoy!';
  });

  ionViewDidEnter(): void {
    this.cargar();
  }

  elegir(p: PeriodoGanancias): void {
    if (p === this.periodo()) return;
    this.periodo.set(p);
    this.elegida.set(null);
    this.editandoMeta.set(false);
    this.cargar();
  }

  tocarBarra(i: number): void {
    this.elegida.update((e) => (e === i ? null : i));
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  }

  guardarMeta(texto: string): void {
    const n = Number(String(texto).replace(/\D/g, ''));
    if (!n) return;
    this.ganancias.guardarMeta(n);
    this.editandoMeta.set(false);
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  }

  irAInicio(): void {
    this.nav.navigateRoot('/conductor/inicio');
  }

  verViajes(): void {
    this.nav.navigateRoot('/conductor/viajes');
  }

  async refrescar(e: CustomEvent): Promise<void> {
    await this.cargar();
    (e.target as HTMLIonRefresherElement).complete();
  }

  async cargar(): Promise<void> {
    const pedido = ++this.pedido; // si cambia de pestaña rápido, solo vale la última respuesta
    this.cargando.set(true);
    this.error.set('');
    try {
      const r = await this.ganancias.resumen(this.periodo());
      if (pedido !== this.pedido) return;
      this.resumen.set(r);
    } catch (e) {
      if (pedido !== this.pedido) return;
      this.resumen.set(null);
      this.error.set((e as ErrorApi).message || 'No pudimos cargar tus ganancias.');
    } finally {
      if (pedido === this.pedido) this.cargando.set(false);
    }
  }

  barraLabel(c: { nombre: string; b: BarraGanancias }): string {
    const v = Number(c.b.viajes);
    return `${c.nombre}: ${pesos(c.b.valor)}, ${v} ${v === 1 ? 'servicio' : 'servicios'}`;
  }
}
