import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { ErrorApi } from '../../../core/api.service';
import { SesionService } from '../../../core/sesion.service';
import { ConductorRegistroService, PasoDocumento } from '../../../servicios/conductor-registro.service';
import { formatearCelular } from '../../../servicios/registro.service';

interface Resumen {
  titulo: string;
  detalle: string;
  listo: boolean;
  editar: string | null;
}

const NOMBRE_ID: Record<string, string> = { CC: 'Cédula', CE: 'C. extranjería', PPT: 'PPT' };

/** Conductor · Paso 5 de 5 · "Revisa y envía": resumen con "Editar" y el envío de la solicitud. */
@Component({
  selector: 'app-conductor-revisar',
  templateUrl: 'conductor-revisar.page.html',
  styleUrls: ['conductor-revisar.page.scss'],
  imports: [IonContent, HeroCieloComponent],
})
export class ConductorRevisarPage {
  private readonly nav = inject(NavController);
  private readonly sesion = inject(SesionService);
  readonly registro = inject(ConductorRegistroService);

  readonly acepta = signal(false);
  readonly intento = signal(false);
  readonly enviando = signal(false);
  readonly error = signal('');

  readonly etiqueta = computed(() => (this.registro.tipo() === 'taxi' ? 'Conductor de taxi' : 'Conductor de moto'));

  readonly filas = computed<Resumen[]>(() => {
    const s = this.sesion.datos();
    const c = this.registro.conductor();
    const v = this.registro.vehiculo();
    const listo = (p: PasoDocumento) => this.registro.pasoListo(p);
    const licencia = this.registro.fila('licencia_conduccion')?.subido?.fecha_vencimiento;
    const docs = this.registro.filasDe('documentos').map((f) => this.corto(f.tipo.codigo));

    return [
      {
        titulo: 'Tus datos',
        detalle: [s?.nombre, s?.telefono ? formatearCelular(s.telefono.replace(/^\+57/, '')) : null].filter(Boolean).join(' · '),
        listo: true,
        editar: null,
      },
      {
        titulo: 'Identidad',
        detalle: `${NOMBRE_ID[c?.tipo_identificacion ?? 'CC']} · documento y selfie`,
        listo: !!c && listo('identidad'),
        editar: '/conductor/identidad',
      },
      {
        titulo: 'Licencia',
        detalle: [c?.categorias.join(', '), licencia ? `vence ${licencia.slice(0, 4)}` : null].filter(Boolean).join(' · ') || 'Sin completar',
        listo: !!c?.categorias.length && listo('licencia'),
        editar: '/conductor/licencia',
      },
      {
        titulo: v?.tipo_vehiculo === 'taxi' ? 'Vehículo' : 'Moto',
        detalle: v
          ? `${v.tipo_vehiculo === 'taxi' ? 'Taxi · ' : ''}${[v.marca, v.linea].filter(Boolean).join(' ')} · ${v.color} · ${v.placa}`
          : 'Sin completar',
        listo: !!v && listo('vehiculo'),
        editar: '/conductor/vehiculo',
      },
      {
        titulo: 'Documentos',
        detalle: this.unir(docs),
        listo: listo('documentos'),
        editar: '/conductor/documentos',
      },
    ];
  });

  readonly todoListo = computed(() => this.filas().every((f) => f.listo));

  constructor() {
    this.registro.cargar().catch((e: ErrorApi) => this.error.set(e.message));
  }

  private corto(codigo: string): string {
    const nombres: Record<string, string> = {
      soat: 'SOAT',
      tarjeta_propiedad: 'propiedad',
      tecnomecanica: 'tecnomecánica',
      casco_certificado: 'casco',
      tarjeta_operacion: 'operación',
      tarjeta_control: 'control',
    };
    return nombres[codigo] ?? codigo;
  }

  /** ["SOAT", "propiedad", "casco"] → "SOAT, propiedad y casco" */
  private unir(partes: string[]): string {
    if (partes.length < 2) return partes.join('');
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
  }

  editar(ruta: string | null): void {
    if (ruta) this.nav.navigateBack(ruta);
  }

  async enviar(): Promise<void> {
    if (this.enviando()) return;
    this.intento.set(true);
    this.error.set('');
    if (!this.todoListo()) {
      this.error.set('Completa lo que falta antes de enviar.');
      return;
    }
    if (!this.acepta()) return;
    this.enviando.set(true);
    try {
      await this.registro.enviarSolicitud();
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      this.nav.navigateRoot('/conductor/enviada');
    } catch (e) {
      this.error.set((e as ErrorApi).message);
    } finally {
      this.enviando.set(false);
    }
  }
}
