import { Component, computed, inject, signal } from '@angular/core';
import { AlertController, IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { ApiService, ErrorApi } from '../../../core/api.service';
import { SesionService } from '../../../core/sesion.service';
import { urlFoto } from '../../../core/formato';
import { IconoComponent } from '../../../componentes/icono/icono.component';
import { BarraInferiorComponent } from '../../../componentes/barra-inferior/barra-inferior.component';
import { iniciales } from '../../../servicios/viaje-activo.service';
import { BARRA_CONDUCTOR } from '../inicio/conductor-inicio.page';

/** GET /api/conductor/mi-perfil */
interface MiPerfil {
  estado: string;
  estado_nombre: string;
  calificacion_promedio: number | null;
  total_calificaciones: number | null;
  total_servicios: number | null;
  categorias_licencia: string[];
  vehiculo: {
    tipo_vehiculo: 'moto' | 'taxi';
    placa: string;
    marca: string;
    linea: string | null;
    modelo_anio: number;
    color: string;
    empresa_afiliadora: string | null;
    numero_interno: string | null;
  } | null;
  documentos: { tipo_documento: string; nombre: string; estado: string; estado_nombre: string; fecha_vencimiento: string | null }[];
}

/**
 * Perfil del conductor (sin frame en el Figma todavía: sigue el estilo de "Mis viajes").
 * Sus datos, la calificación, el vehículo con placa, marca, modelo y color (HU 2.6), la licencia y el estado
 * de los documentos. Cerrar sesión.
 */
@Component({
  selector: 'app-conductor-perfil',
  templateUrl: 'conductor-perfil.page.html',
  styleUrls: ['conductor-perfil.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, BarraInferiorComponent],
})
export class ConductorPerfilPage implements ViewDidEnter {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly nav = inject(NavController);
  private readonly alertas = inject(AlertController);

  readonly barra = BARRA_CONDUCTOR;
  readonly perfil = signal<MiPerfil | null>(null);
  readonly error = signal('');

  readonly nombre = computed(() => this.sesion.datos()?.nombre ?? '');
  readonly foto = computed(() => urlFoto(this.sesion.datos()?.foto));
  readonly celular = computed(() => this.sesion.datos()?.telefono ?? '');
  readonly iniciales = computed(() => iniciales(this.nombre()));
  readonly calificacion = computed(() => {
    const c = Number(this.perfil()?.calificacion_promedio);
    return c ? c.toFixed(1).replace('.', ',') : '—';
  });
  /** "Chevrolet Spark GT 2026" */
  readonly modelo = computed(() => {
    const v = this.perfil()?.vehiculo;
    return v ? [v.marca, v.linea, v.modelo_anio].filter(Boolean).join(' ') : '';
  });

  ionViewDidEnter(): void {
    this.cargar();
  }

  claseEstado(estado: string): string {
    if (estado === 'aprobado') return 'ok';
    if (estado === 'rechazado' || estado === 'vencido') return 'mal';
    return 'espera';
  }

  async salir(): Promise<void> {
    const alerta = await this.alertas.create({
      header: '¿Cerrar sesión?',
      message: 'Dejarás de recibir solicitudes en este celular.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar sesión', role: 'destructive' },
      ],
    });
    await alerta.present();
    if ((await alerta.onDidDismiss()).role !== 'destructive') return;
    await this.api.post('/conductor/disponibilidad', { activo: false }).catch(() => undefined);
    this.sesion.cerrar();
    this.nav.navigateRoot('/inicio', { animationDirection: 'back' });
  }

  private async cargar(): Promise<void> {
    try {
      this.perfil.set(await this.api.get<MiPerfil>('/conductor/mi-perfil'));
      this.error.set('');
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos cargar tu perfil.');
    }
  }
}
