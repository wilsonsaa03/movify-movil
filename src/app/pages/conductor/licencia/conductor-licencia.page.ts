import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { FotoTileComponent } from '../../../componentes/foto-tile/foto-tile.component';
import { ErrorApi } from '../../../core/api.service';
import { CATEGORIAS, ConductorRegistroService } from '../../../servicios/conductor-registro.service';

/** Conductor · Paso 2 de 5 · "Tu licencia": categoría, número, vencimiento y fotos. */
@Component({
  selector: 'app-conductor-licencia',
  templateUrl: 'conductor-licencia.page.html',
  styleUrls: ['conductor-licencia.page.scss'],
  imports: [IonContent, HeroCieloComponent, FotoTileComponent],
})
export class ConductorLicenciaPage {
  private readonly nav = inject(NavController);
  readonly registro = inject(ConductorRegistroService);

  readonly categoria = signal<string | null>(null);
  readonly numero = signal('');
  readonly vence = signal('');
  readonly intento = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');

  readonly hoy = new Date().toISOString().slice(0, 10);
  readonly etiqueta = computed(() => (this.registro.tipo() === 'taxi' ? 'Conductor de taxi' : 'Conductor de moto'));
  readonly categorias = computed(() => CATEGORIAS[this.registro.tipo() ?? 'moto']);

  readonly errores = computed(() => {
    const e: Record<string, string> = {};
    if (!this.categoria()) e['categoria'] = 'Elige la categoría que dice tu licencia.';
    if (!/^[0-9A-Z]{4,20}$/.test(this.numero())) e['numero'] = 'Escribe el número de tu licencia.';
    if (!this.vence()) e['vence'] = 'Escribe la fecha de vencimiento.';
    else if (this.vence() < this.hoy) e['vence'] = 'Tu licencia está vencida. Renuévala para poder trabajar.';
    return e;
  });

  constructor() {
    this.registro
      .cargar()
      .then((p) => {
        const c = p.conductor;
        const permitidas = this.categorias().map((x) => x.codigo);
        const elegida = c?.categorias.find((x) => permitidas.includes(x));
        if (elegida) this.categoria.set(elegida);
        this.numero.set(c?.numero_licencia ?? c?.numero_identificacion ?? '');
        const doc = this.registro.fila('licencia_conduccion')?.subido;
        if (doc?.fecha_vencimiento) this.vence.set(doc.fecha_vencimiento.slice(0, 10));
      })
      .catch((e: ErrorApi) => this.error.set(e.message));
  }

  ver(campo: string): string {
    return this.intento() ? (this.errores()[campo] ?? '') : '';
  }

  escribirNumero(e: Event): void {
    this.numero.set((e.target as HTMLInputElement).value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 20));
  }

  private async guardar(): Promise<boolean> {
    this.intento.set(true);
    if (Object.keys(this.errores()).length) return false;
    const c = this.registro.conductor();
    if (c && c.categorias.includes(this.categoria()!) && c.numero_licencia === this.numero()) return true;
    await this.registro.guardarLicencia({ categoriasLicencia: [this.categoria()!], numeroLicencia: this.numero() });
    return true;
  }

  async subir(codigo: string, archivo: File): Promise<void> {
    this.error.set('');
    try {
      if (!(await this.guardar())) {
        this.error.set('Completa los datos de tu licencia antes de subir las fotos.');
        return;
      }
      // El vencimiento viaja con la foto del frente (es el documento "licencia_conduccion")
      await this.registro.subir(codigo, archivo, codigo === 'licencia_conduccion' ? this.vence() : null);
    } catch (e) {
      this.error.set((e as ErrorApi).message);
    }
  }

  async continuar(): Promise<void> {
    if (this.guardando()) return;
    this.error.set('');
    this.guardando.set(true);
    try {
      if (!(await this.guardar())) return;
      if (!this.registro.pasoListo('licencia')) {
        this.error.set('Sube el frente y el reverso de tu licencia.');
        return;
      }
      this.nav.navigateForward('/conductor/vehiculo');
    } catch (e) {
      this.error.set((e as ErrorApi).message);
    } finally {
      this.guardando.set(false);
    }
  }
}
