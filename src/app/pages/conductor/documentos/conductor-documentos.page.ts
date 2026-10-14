import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { FilaDocumentoComponent } from '../../../componentes/fila-documento/fila-documento.component';
import { ErrorApi } from '../../../core/api.service';
import { ConductorRegistroService, FilaDocumento } from '../../../servicios/conductor-registro.service';

/**
 * Conductor · Paso 4 de 5 · "Tus documentos": SOAT, tarjeta de propiedad, técnico-mecánica
 * y casco certificado (moto) o tarjeta de operación (taxi).
 * Si el admin rechazó algo, aquí arriba aparece qué corregir (aunque sea de otro paso).
 */
@Component({
  selector: 'app-conductor-documentos',
  templateUrl: 'conductor-documentos.page.html',
  styleUrls: ['conductor-documentos.page.scss'],
  imports: [IonContent, HeroCieloComponent, FilaDocumentoComponent],
})
export class ConductorDocumentosPage {
  private readonly nav = inject(NavController);
  readonly registro = inject(ConductorRegistroService);

  readonly error = signal('');
  readonly cargando = signal(true);

  /** Documento abierto en la hoja inferior (para elegir foto/PDF y la fecha de vencimiento). */
  readonly abierto = signal<FilaDocumento | null>(null);
  readonly vence = signal('');
  readonly errorHoja = signal('');

  readonly hoy = new Date().toISOString().slice(0, 10);
  readonly etiqueta = computed(() => (this.registro.tipo() === 'taxi' ? 'Conductor de taxi' : 'Conductor de moto'));
  readonly documentos = computed(() => this.registro.filasDe('documentos'));
  /** Lo que el admin rechazó en los otros pasos (selfie, fotos de la moto...). */
  readonly rechazadosOtros = computed(() =>
    this.registro.filas().filter((f) => f.estado === 'rechazado' && f.tipo.paso !== 'documentos'),
  );
  readonly corrigiendo = computed(() => this.registro.progreso()?.siguiente === 'corregir');

  constructor() {
    this.registro
      .cargar()
      .catch((e: ErrorApi) => this.error.set(e.message))
      .finally(() => this.cargando.set(false));
  }

  abrir(f: FilaDocumento): void {
    this.errorHoja.set('');
    this.vence.set(f.subido?.fecha_vencimiento?.slice(0, 10) ?? '');
    this.abierto.set(f);
  }

  cerrar(): void {
    this.abierto.set(null);
  }

  /** Antes de abrir la cámara: si el documento vence, la fecha es obligatoria. */
  revisarFecha(e: Event): void {
    const f = this.abierto();
    if (!f?.tipo.requiere_vencimiento) return;
    if (!this.vence()) {
      e.preventDefault();
      this.errorHoja.set('Primero escribe la fecha de vencimiento.');
    } else if (this.vence() < this.hoy) {
      e.preventDefault();
      this.errorHoja.set('Ese documento ya está vencido. Súbelo cuando lo renueves.');
    }
  }

  async elegido(e: Event): Promise<void> {
    const f = this.abierto();
    const campo = e.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!f || !archivo) return;
    this.cerrar();
    this.error.set('');
    try {
      await this.registro.subir(f.tipo.codigo, archivo, f.tipo.requiere_vencimiento ? this.vence() : null);
    } catch (err) {
      this.error.set(`${f.tipo.nombre}: ${(err as ErrorApi).message}`);
    }
  }

  /** Los rechazados de otros pasos se corrigen en su propia pantalla. */
  irA(f: FilaDocumento): void {
    this.nav.navigateForward(`/conductor/${f.tipo.paso}`);
  }

  icono(f: FilaDocumento): 'documento' | 'persona' | 'casco' {
    return f.tipo.codigo === 'casco_certificado' ? 'casco' : f.tipo.codigo === 'selfie' ? 'persona' : 'documento';
  }

  continuar(): void {
    this.error.set('');
    const faltan = this.registro.filas().filter((f) => f.estado === 'falta' || f.estado === 'rechazado');
    if (faltan.length) {
      this.error.set(`Te falta: ${faltan.slice(0, 2).map((f) => f.tipo.nombre).join(', ')}${faltan.length > 2 ? '…' : ''}`);
      return;
    }
    this.nav.navigateForward('/conductor/revisar');
  }
}
