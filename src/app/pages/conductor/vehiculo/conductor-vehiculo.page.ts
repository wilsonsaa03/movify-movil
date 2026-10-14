import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { FotoTileComponent } from '../../../componentes/foto-tile/foto-tile.component';
import { ErrorApi } from '../../../core/api.service';
import {
  ConductorRegistroService,
  DatosVehiculo,
  TipoVehiculo,
  formatearPlaca,
  placaValida,
} from '../../../servicios/conductor-registro.service';

const MARCAS: Record<TipoVehiculo, string[]> = {
  moto: ['Yamaha', 'Honda', 'Suzuki', 'Bajaj', 'AKT', 'TVS', 'Hero', 'Kawasaki', 'Victory'],
  taxi: ['Chevrolet', 'Hyundai', 'Kia', 'Renault', 'Nissan', 'Suzuki', 'Toyota', 'Volkswagen'],
};
const COLORES = ['Negro', 'Blanco', 'Gris', 'Plata', 'Rojo', 'Azul', 'Amarillo', 'Verde', 'Naranja'];

/** Conductor · Paso 3 de 5 · "Tu moto" / "Tu vehículo": placa, datos, fotos y casco del pasajero. */
@Component({
  selector: 'app-conductor-vehiculo',
  templateUrl: 'conductor-vehiculo.page.html',
  styleUrls: ['conductor-vehiculo.page.scss'],
  imports: [IonContent, HeroCieloComponent, FotoTileComponent],
})
export class ConductorVehiculoPage {
  private readonly nav = inject(NavController);
  readonly registro = inject(ConductorRegistroService);

  readonly tipo = signal<TipoVehiculo>(this.registro.tipo() ?? 'moto');
  readonly placa = signal('');
  readonly color = signal('');
  readonly marca = signal('');
  readonly linea = signal('');
  readonly anio = signal('');
  readonly cilindraje = signal('');
  readonly empresa = signal('');
  readonly interno = signal('');
  readonly casco = signal(true);

  readonly intento = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');

  readonly colores = COLORES;
  readonly marcas = computed(() => MARCAS[this.tipo()]);
  readonly anioMax = new Date().getFullYear() + 1;
  readonly etiqueta = computed(() => (this.tipo() === 'taxi' ? 'Conductor de taxi' : 'Conductor de moto'));
  readonly titulo = computed(() => (this.tipo() === 'taxi' ? 'Tu vehículo' : 'Tu moto'));

  /** Fotos que pide el prototipo: moto con placa, taxi con interior. */
  readonly fotos = computed(() => this.registro.filasDe('vehiculo'));
  readonly fotosListas = computed(() => this.fotos().filter((f) => f.estado === 'pendiente' || f.estado === 'aprobado').length);

  readonly errores = computed(() => {
    const e: Record<string, string> = {};
    if (!placaValida(this.tipo(), this.placa())) {
      e['placa'] = this.tipo() === 'taxi' ? 'La placa de un taxi es así: ABC 123.' : 'La placa de una moto es así: ABC 12D.';
    }
    if (!this.color().trim()) e['color'] = 'Escribe el color.';
    if (!this.marca().trim()) e['marca'] = 'Escribe la marca.';
    const a = Number(this.anio());
    if (!a || a < 1990 || a > this.anioMax) e['anio'] = 'Año no válido.';
    if (this.tipo() === 'moto') {
      const c = Number(this.cilindraje());
      if (!c || c < 50 || c > 2000) e['cilindraje'] = 'Cilindraje no válido.';
    }
    if (this.tipo() === 'taxi' && !this.empresa().trim()) e['empresa'] = 'Escribe la empresa a la que está afiliado.';
    return e;
  });

  constructor() {
    this.registro
      .cargar()
      .then(() => {
        const v = this.registro.vehiculo();
        if (!v) return;
        this.tipo.set(v.tipo_vehiculo);
        this.placa.set(formatearPlaca(v.placa));
        this.color.set(v.color);
        this.marca.set(v.marca);
        this.linea.set(v.linea ?? '');
        this.anio.set(String(v.modelo_anio));
        this.cilindraje.set(v.cilindraje_cc ? String(v.cilindraje_cc) : '');
        this.empresa.set(v.empresa_afiliadora ?? '');
        this.interno.set(v.numero_interno ?? '');
        this.casco.set(v.casco_pasajero ?? true);
      })
      .catch((e: ErrorApi) => this.error.set(e.message));
  }

  ver(campo: string): string {
    return this.intento() ? (this.errores()[campo] ?? '') : '';
  }

  valor(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  cambiarTipo(t: TipoVehiculo): void {
    this.tipo.set(t);
    this.registro.elegirTipo(t);
    this.placa.set(formatearPlaca(this.placa()));
    // Sin vehículo guardado, las fotos que se piden dependen de lo que eligió (placa o interior)
    if (!this.registro.vehiculo()) this.registro.cargar().catch(() => undefined);
  }

  escribirPlaca(e: Event): void {
    const campo = e.target as HTMLInputElement;
    this.placa.set(formatearPlaca(campo.value));
    campo.value = this.placa();
  }

  private datos(): DatosVehiculo {
    return {
      tipoVehiculo: this.tipo(),
      placa: this.placa(),
      marca: this.marca().trim(),
      linea: this.linea().trim(),
      modeloAnio: Number(this.anio()),
      color: this.color().trim(),
      empresaAfiliadora: this.tipo() === 'taxi' ? this.empresa().trim() : '',
      numeroInterno: this.tipo() === 'taxi' ? this.interno().trim() : '',
      cilindrajeCc: this.tipo() === 'moto' ? Number(this.cilindraje()) : null,
      cascoPasajero: this.casco(),
    };
  }

  /** Guarda (o corrige) el vehículo si algo cambió. Hace falta antes de subir las fotos. */
  private async guardar(): Promise<boolean> {
    this.intento.set(true);
    if (Object.keys(this.errores()).length) return false;
    const d = this.datos();
    const v = this.registro.vehiculo();
    const igual =
      v &&
      v.tipo_vehiculo === d.tipoVehiculo &&
      v.placa === d.placa.replace(/\s/g, '') &&
      v.marca === d.marca &&
      (v.linea ?? '') === d.linea &&
      v.modelo_anio === d.modeloAnio &&
      v.color === d.color &&
      (v.empresa_afiliadora ?? '') === d.empresaAfiliadora &&
      (v.numero_interno ?? '') === d.numeroInterno &&
      (d.tipoVehiculo === 'taxi' || (v.cilindraje_cc === d.cilindrajeCc && v.casco_pasajero === d.cascoPasajero));
    if (igual) return true;
    await this.registro.registrarVehiculo(d);
    return true;
  }

  async subir(codigo: string, archivo: File): Promise<void> {
    this.error.set('');
    try {
      if (!(await this.guardar())) {
        this.error.set('Completa los datos del vehículo antes de subir las fotos.');
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
      if (!this.registro.pasoListo('vehiculo')) {
        this.error.set(`Faltan ${this.fotos().length - this.fotosListas()} fotos del vehículo.`);
        return;
      }
      this.nav.navigateForward('/conductor/documentos');
    } catch (e) {
      this.error.set((e as ErrorApi).message);
    } finally {
      this.guardando.set(false);
    }
  }

  /** "foto_frente" → "Frente" */
  corto(nombre: string): string {
    const m = nombre.match(/\(([^)]+)\)/);
    if (m) return m[1][0].toUpperCase() + m[1].slice(1);
    return nombre.includes('placa') ? 'Placa' : nombre.includes('interior') ? 'Interior' : nombre;
  }
}
