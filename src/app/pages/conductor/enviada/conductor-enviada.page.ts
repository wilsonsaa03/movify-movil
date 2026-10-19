import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ApiService, ErrorApi } from '../../../core/api.service';
import { ConductorRegistroService, FilaDocumento } from '../../../servicios/conductor-registro.service';

interface Hito {
  titulo: string;
  detalle?: string;
  estado: 'hecho' | 'actual' | 'futuro' | 'fallo';
}

/** revision → (admin) → aprobado | rechazado | suspendido. */
type Situacion = 'revision' | 'aprobado' | 'rechazado' | 'suspendido';

/** Textos del encabezado según la situación. */
const ENCABEZADO: Record<Situacion, { titulo: string; texto: string }> = {
  revision: { titulo: '¡Solicitud enviada!', texto: 'Revisaremos tus documentos para activar tu cuenta.' },
  aprobado: { titulo: '¡Ya puedes trabajar!', texto: 'Tu cuenta de conductor está activa.' },
  rechazado: { titulo: 'Solicitud rechazada', texto: 'Revisamos tu solicitud y hay algo por corregir antes de activar tu cuenta.' },
  suspendido: { titulo: 'Cuenta suspendida', texto: 'Por ahora no puedes recibir viajes con MoviFY.' },
};

const fecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Conductor 6 · Estado de la solicitud (a donde llega después de enviarla y cada vez que abre la app sin estar aprobado).
 *  - En revisión: línea de tiempo y "Actualizar estado".
 *  - Rechazada: el motivo que escribió el admin, los documentos marcados y "Corregir mi solicitud". Cuando ya
 *    corrigió algo, "Reenviar a revisión" (el backend no deja reenviar sin corregir).
 *  - Suspendida: el motivo y el contacto de soporte (no se reactiva desde la app).
 *  - Aprobada: "Empezar a trabajar".
 */
@Component({
  selector: 'app-conductor-enviada',
  templateUrl: 'conductor-enviada.page.html',
  styleUrls: ['conductor-enviada.page.scss'],
  imports: [IonContent],
})
export class ConductorEnviadaPage {
  private readonly nav = inject(NavController);
  private readonly api = inject(ApiService);
  readonly registro = inject(ConductorRegistroService);

  readonly actualizando = signal(false);
  readonly reenviando = signal(false);
  readonly error = signal('');

  readonly siguiente = computed(() => this.registro.progreso()?.siguiente ?? 'revision');
  readonly situacion = computed<Situacion>(() => {
    const s = this.siguiente();
    if (s === 'aprobado') return 'aprobado';
    if (s === 'suspendido') return 'suspendido';
    if (s === 'corregir') return 'rechazado';
    return 'revision';
  });
  // Atajos para la plantilla
  readonly aprobado = computed(() => this.situacion() === 'aprobado');
  readonly rechazado = computed(() => this.situacion() === 'rechazado');
  readonly suspendido = computed(() => this.situacion() === 'suspendido');
  readonly encabezado = computed(() => ENCABEZADO[this.situacion()]);

  /** Lo que escribió el admin al rechazar o suspender. */
  readonly motivo = computed(() => this.registro.progreso()?.motivo_estado?.trim() || null);
  readonly cuando = computed(() => {
    const f = this.registro.progreso()?.rechazado_en;
    return f ? fecha.format(new Date(f)) : null;
  });
  /** Documentos que el admin marcó como rechazados (con su observación). */
  readonly documentosRechazados = computed<FilaDocumento[]>(() => this.registro.filas().filter((f) => f.estado === 'rechazado'));
  /** Ya corrigió algo desde el rechazo: puede volver a enviar. */
  readonly corregido = computed(() => !!this.registro.progreso()?.corregido);

  readonly hitos = computed<Hito[]>(() => {
    switch (this.situacion()) {
      case 'aprobado':
        return [
          { titulo: 'Registrado', estado: 'hecho' },
          { titulo: 'Documentos enviados', estado: 'hecho' },
          { titulo: 'En revisión', detalle: 'Revisamos tus documentos', estado: 'hecho' },
          { titulo: 'Cuenta activa', detalle: '¡Ya puedes recibir viajes!', estado: 'hecho' },
        ];
      case 'rechazado':
        return [
          { titulo: 'Registrado', estado: 'hecho' },
          { titulo: 'Documentos enviados', estado: 'hecho' },
          { titulo: 'Solicitud rechazada', detalle: this.cuando() ?? undefined, estado: 'fallo' },
          this.corregido()
            ? { titulo: 'Corrección lista', detalle: 'Ya puedes reenviar tu solicitud', estado: 'hecho' }
            : { titulo: 'Corrige y vuelve a enviar', detalle: 'Te diremos qué cambiar', estado: 'actual' },
        ];
      case 'suspendido':
        return [
          { titulo: 'Cuenta aprobada', estado: 'hecho' },
          { titulo: 'Cuenta suspendida', detalle: this.cuando() ?? undefined, estado: 'fallo' },
          { titulo: 'Revisión con soporte', detalle: 'Escríbenos para revisar tu caso', estado: 'actual' },
        ];
      default:
        return [
          { titulo: 'Registrado', estado: 'hecho' },
          { titulo: 'Documentos enviados', estado: 'hecho' },
          { titulo: 'En revisión', detalle: 'Normalmente de 1 a 3 días hábiles', estado: 'actual' },
          { titulo: 'Cuenta activa', detalle: 'Te avisaremos por SMS', estado: 'futuro' },
        ];
    }
  });

  constructor() {
    this.actualizar();
  }

  async actualizar(): Promise<void> {
    this.actualizando.set(true);
    this.error.set('');
    try {
      await this.registro.cargar();
    } catch (e) {
      this.error.set((e as ErrorApi).message);
    } finally {
      this.actualizando.set(false);
    }
  }

  /** Botón principal: depende de la situación. */
  async principal(): Promise<void> {
    switch (this.situacion()) {
      case 'aprobado':
        return this.empezar();
      case 'rechazado':
        return this.corregido() ? this.reenviar() : this.corregir();
      case 'suspendido':
        return this.soporte();
      default:
        return this.salirAlInicio();
    }
  }

  /** Abre los documentos (los rechazados salen marcados en rojo y arriba va el motivo). */
  corregir(): void {
    this.nav.navigateForward('/conductor/documentos');
  }

  /** Un documento rechazado se vuelve a subir desde su paso (identidad, licencia, vehículo o documentos). */
  subirDeNuevo(f: FilaDocumento): void {
    this.nav.navigateForward(`/conductor/${f.tipo.paso}`);
  }

  /** Ya corrigió: vuelve a pedir revisión (POST /conductor/solicitud; el backend comprueba que haya corregido). */
  async reenviar(): Promise<void> {
    if (this.reenviando()) return;
    this.reenviando.set(true);
    this.error.set('');
    try {
      await this.registro.enviarSolicitud();
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    } catch (e) {
      this.error.set((e as ErrorApi).message);
    } finally {
      this.reenviando.set(false);
    }
  }

  soporte(): void {
    window.location.href = 'mailto:soporte@movify.co?subject=Revisión%20de%20mi%20cuenta%20de%20conductor';
  }

  private async empezar(): Promise<void> {
    // El rol "conductor" lo da la BD al aprobarlo: el token actual no lo trae, se pide uno nuevo
    this.actualizando.set(true);
    try {
      await this.api.renovarSesion();
    } finally {
      this.actualizando.set(false);
    }
    this.nav.navigateRoot('/conductor/inicio');
  }

  /**
   * "Entendido" / "Cerrar sesión": /inicio es solo para invitados (invitadoGuard), así que con la sesión abierta
   * el guard lo devolvía a esta misma pantalla. Se cierra la sesión y queda en el inicio;
   * cuando vuelva a entrar con su clave, rutaInicio() lo trae aquí a ver el estado.
   */
  salirAlInicio(): void {
    this.api.cerrarSesion(); // borra la sesión de una vez; el logout al backend sigue en segundo plano
    this.nav.navigateRoot('/inicio', { animationDirection: 'back' });
  }
}
