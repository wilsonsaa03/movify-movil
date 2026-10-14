import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { FotoTileComponent } from '../../../componentes/foto-tile/foto-tile.component';
import { FilaDocumentoComponent } from '../../../componentes/fila-documento/fila-documento.component';
import { ErrorApi } from '../../../core/api.service';
import { ConductorRegistroService, DatosIdentidad } from '../../../servicios/conductor-registro.service';

type TipoId = DatosIdentidad['tipoIdentificacion'];

/** Conductor · Paso 1 de 5 · "Confirma quién eres": documento, fotos (frente y reverso) y selfie. */
@Component({
  selector: 'app-conductor-identidad',
  templateUrl: 'conductor-identidad.page.html',
  styleUrls: ['conductor-identidad.page.scss'],
  imports: [IonContent, HeroCieloComponent, FotoTileComponent, FilaDocumentoComponent],
})
export class ConductorIdentidadPage {
  private readonly nav = inject(NavController);
  readonly registro = inject(ConductorRegistroService);

  readonly tiposId: { codigo: TipoId; texto: string }[] = [
    { codigo: 'CC', texto: 'Cédula' },
    { codigo: 'CE', texto: 'C. extranjería' },
    { codigo: 'PPT', texto: 'PPT' },
  ];

  readonly tipoId = signal<TipoId>('CC');
  readonly numero = signal('');
  readonly nacimiento = signal('');
  readonly intento = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');

  /** Fecha máxima para el selector: hoy hace 18 años. */
  readonly maxNacimiento = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  })();

  readonly etiqueta = computed(() => (this.registro.tipo() === 'taxi' ? 'Conductor de taxi' : 'Conductor de moto'));

  readonly errores = computed(() => {
    const e: Record<string, string> = {};
    const n = this.numero().replace(/\D/g, '');
    if (this.tipoId() === 'CC' ? !/^\d{6,10}$/.test(n) : this.numero().trim().length < 4) {
      e['numero'] = 'Revisa el número de tu documento.';
    }
    if (!this.nacimiento()) e['nacimiento'] = 'Escribe tu fecha de nacimiento.';
    else if (this.nacimiento() > this.maxNacimiento) e['nacimiento'] = 'Para conducir en MoviFY debes ser mayor de edad.';
    return e;
  });

  readonly fotosListas = computed(() => this.registro.progreso() !== null && this.registro.pasoListo('identidad'));

  constructor() {
    this.registro
      .cargar()
      .then((p) => {
        const c = p.conductor;
        if (c) {
          this.tipoId.set(c.tipo_identificacion);
          this.numero.set(this.formatear(c.numero_identificacion));
          this.nacimiento.set(String(c.fecha_nacimiento).slice(0, 10));
        }
      })
      .catch((e: ErrorApi) => this.error.set(e.message));
  }

  ver(campo: string): string {
    return this.intento() ? (this.errores()[campo] ?? '') : '';
  }

  escribirNumero(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.numero.set(this.tipoId() === 'CC' ? this.formatear(v) : v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 20));
  }

  /** "1111222333" → "1.111.222.333" (como se lee en la cédula). */
  private formatear(v: string): string {
    const d = v.replace(/\D/g, '').slice(0, 10);
    return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /** Crea o actualiza el perfil. Hace falta antes de subir la primera foto. */
  private async guardar(): Promise<boolean> {
    this.intento.set(true);
    if (Object.keys(this.errores()).length) return false;
    const c = this.registro.conductor();
    const datos: DatosIdentidad = {
      tipoIdentificacion: this.tipoId(),
      numeroIdentificacion: this.numero().replace(/\./g, ''),
      fechaNacimiento: this.nacimiento(),
    };
    const igual =
      c &&
      c.tipo_identificacion === datos.tipoIdentificacion &&
      c.numero_identificacion === datos.numeroIdentificacion.toUpperCase() &&
      String(c.fecha_nacimiento).slice(0, 10) === datos.fechaNacimiento;
    if (igual) return true;
    await this.registro.guardarIdentidad(datos);
    return true;
  }

  async subir(codigo: string, archivo: File): Promise<void> {
    this.error.set('');
    try {
      if (!(await this.guardar())) {
        this.error.set('Completa tus datos antes de subir las fotos.');
        return;
      }
      await this.registro.subir(codigo, archivo);
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
      if (!this.fotosListas()) {
        this.error.set('Sube las dos caras de tu documento y tu selfie.');
        return;
      }
      this.nav.navigateForward('/conductor/licencia');
    } catch (e) {
      this.error.set((e as ErrorApi).message);
    } finally {
      this.guardando.set(false);
    }
  }
}
