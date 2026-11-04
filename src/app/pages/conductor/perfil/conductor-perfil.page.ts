import { Component, computed, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { AlertController, IonContent, IonFooter, IonRefresher, IonRefresherContent, NavController, ToastController, ViewDidEnter } from '@ionic/angular';
import { ApiService, ErrorApi } from '../../../core/api.service';
import { SesionService } from '../../../core/sesion.service';
import { urlFoto } from '../../../core/formato';
import { AppNavegacion, appNavegacion, guardarAppNavegacion } from '../../../core/navegacion';
import { PushService } from '../../../core/push.service';
import { IconoComponent, NombreIcono } from '../../../componentes/icono/icono.component';
import { BarraInferiorComponent } from '../../../componentes/barra-inferior/barra-inferior.component';
import { iniciales } from '../../../servicios/viaje-activo.service';
import { ConductorRegistroService } from '../../../servicios/conductor-registro.service';
import { UbicacionService } from '../../../servicios/ubicacion.service';
import { NotificacionesService, haceCuanto } from '../../../servicios/notificaciones.service';
import { ContactoEmergencia, PerfilService, claveDebil } from '../../../servicios/perfil.service';
import {
  ConductorPerfilService,
  Desempeno,
  Desvinculado,
  DocumentoConductor,
  MiPerfilConductor,
  estadoDocumento,
  nivelCancelacion,
} from '../../../servicios/conductor-perfil.service';
import { BARRA_CONDUCTOR } from '../inicio/conductor-inicio.page';
import { CambiarCelularComponent } from '../../../componentes/cambiar-celular/cambiar-celular.component';
import { ConductorEnLineaService } from '../../../servicios/conductor-en-linea.service';

/**
 * Perfil del conductor, inspirado en Uber Driver, DiDi Conductor, inDrive y WayCali (sin niveles) (sin frame en el Figma: sigue el estilo
 * de "Mis viajes"):
 * - Encabezado con foto (se cambia aquí), calificación, viajes, antigüedad y la placa.
 * - Avisos que importan primero: sanción por cancelaciones, documentos vencidos o por vencer (con "Renovar"),
 *   cuenta suspendida.
 * - Accesos rápidos: Ganancias, Mis viajes, Notificaciones, Ayuda.
 * - Tu desempeño: estrellas por puntaje, tasa de cancelación contra el límite (20 %), pasajeros que lo tienen de
 *   favorito, y lo que dicen sus pasajeros (comentarios sin nombre).
 * - Vehículo, licencia y documentos (renovar un documento lo deja "En revisión" y reemplaza el anterior).
 * - Seguridad: contactos de emergencia y la clave de 4 números. Invitar conductores, versión y cerrar sesión.
 * - Servicios autorizados (de servicio_vehiculo_permitido), "Sobre mí" y los elogios que le dejan.
 * - Ajustes: ubicación, notificaciones, app de navegación (Google Maps o Waze), soporte.
 * - Seguridad: SOS, reportar un incidente y personas desvinculadas (volver a vincular).
 * El nombre no se edita aquí: está verificado con su documento (se cambia por Ayuda).
 */
@Component({
  selector: 'app-conductor-perfil',
  templateUrl: 'conductor-perfil.page.html',
  styleUrls: ['conductor-perfil.page.scss'],
  imports: [IonContent, IonFooter, IonRefresher, IonRefresherContent, IconoComponent, BarraInferiorComponent, CambiarCelularComponent],
})
export class ConductorPerfilPage implements ViewDidEnter {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly nav = inject(NavController);
  private readonly alertas = inject(AlertController);
  private readonly avisos = inject(ToastController);
  private readonly datos = inject(ConductorPerfilService);
  private readonly perfiles = inject(PerfilService);
  private readonly enLinea = inject(ConductorEnLineaService);
  /** Hoja "Cambiar mi celular" abierta. */
  readonly cambiandoCelular = signal(false);
  private readonly registro = inject(ConductorRegistroService);
  readonly notificaciones = inject(NotificacionesService).noLeidas;
  private readonly push = inject(PushService);
  private readonly gps = inject(UbicacionService);

  readonly barra = BARRA_CONDUCTOR;
  readonly perfil = signal<MiPerfilConductor | null>(null);
  readonly desempeno = signal<Desempeno | null>(null);
  readonly contactos = signal<ContactoEmergencia[]>([]);
  readonly desvinculados = signal<Desvinculado[]>([]);

  // Sobre mí
  readonly editandoSobreMi = signal(false);
  readonly sobreMiTexto = signal('');
  readonly errorSobreMi = signal('');
  readonly guardandoSobreMi = signal(false);

  // Ajustes
  readonly appNav = appNavegacion;
  readonly permisoPush = signal<'permitidas' | 'bloqueadas' | 'preguntar' | 'no-disponible'>('no-disponible');
  readonly ubicacion = this.gps.estado;
  readonly error = signal('');
  readonly subiendoFoto = signal(false);
  readonly version = signal('');
  readonly hace = haceCuanto;
  readonly Math = Math;
  readonly estadoDoc = estadoDocumento;

  // Renovar un documento: hoja con la fecha (si vence) y el archivo
  readonly renovando = signal<DocumentoConductor | null>(null);
  readonly venceNueva = signal('');
  readonly errorRenovar = signal('');
  readonly enviandoDoc = signal(false);
  readonly hoy = new Date().toISOString().slice(0, 10);

  // Contacto nuevo
  readonly agregandoContacto = signal(false);
  readonly contactoNombre = signal('');
  readonly contactoCelular = signal('');
  readonly errorContacto = signal('');

  // Clave
  readonly cambiandoClave = signal(false);
  readonly claveActual = signal('');
  readonly claveNueva = signal('');
  readonly claveRepetida = signal('');
  readonly errorClave = signal('');

  readonly accesos: { texto: string; icono: NombreIcono; ruta: string }[] = [
    { texto: 'Ganancias', icono: 'dinero', ruta: '/conductor/ganancias' },
    { texto: 'Mis viajes', icono: 'lista', ruta: '/conductor/viajes' },
    { texto: 'Avisos', icono: 'campana', ruta: '/conductor/notificaciones' },
    { texto: 'Ayuda', icono: 'mensaje', ruta: '/conductor/ayuda' },
  ];

  readonly nombre = computed(() => this.sesion.datos()?.nombre ?? '');
  readonly foto = computed(() => urlFoto(this.sesion.datos()?.foto));
  readonly iniciales = computed(() => iniciales(this.nombre()));
  readonly celular = computed(() => {
    const t = (this.sesion.datos()?.telefono ?? '').replace(/^\+57/, '');
    return t.length === 10 ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}` : t;
  });
  readonly calificacion = computed(() => {
    const c = Number(this.desempeno()?.calificacion_promedio ?? this.perfil()?.calificacion_promedio);
    return c ? c.toFixed(1).replace('.', ',') : 'Nuevo';
  });
  readonly desde = computed(() => {
    const f = this.desempeno()?.conductor_desde;
    return f ? new Date(f).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }).replace(/\./g, '') : '';
  });
  /** "Chevrolet Spark GT 2026" */
  readonly modelo = computed(() => {
    const v = this.perfil()?.vehiculo;
    return v ? [v.marca, v.linea, v.modelo_anio].filter(Boolean).join(' ') : '';
  });

  /** Barras de estrellas 5 → 1 con su proporción. */
  readonly estrellas = computed(() => {
    const e = this.desempeno()?.estrellas ?? {};
    const total = Object.values(e).reduce((s, n) => s + Number(n), 0);
    return [5, 4, 3, 2, 1].map((p) => ({ puntos: p, n: Number(e[p] ?? 0), parte: total ? Number(e[p] ?? 0) / total : 0 }));
  });
  readonly cancelacion = computed(() => {
    const d = this.desempeno();
    if (!d) return null;
    const tasa = Number(d.tasa_cancelacion);
    const limite = Number(d.limite_cancelacion);
    const cerrados = Number(d.total_servicios) + Number(d.total_cancelaciones);
    return {
      tasa,
      limite,
      nivel: nivelCancelacion(tasa, limite),
      // la barra llega hasta el doble del límite; la marca del límite queda en la mitad
      ancho: Math.min(1, tasa / (limite * 2)),
      pocos: cerrados < Number(d.minimo_cierres),
      texto: tasa.toFixed(1).replace('.', ',').replace(',0', '') + ' %',
    };
  });

  /** Lo más urgente arriba: sanción, suspensión, documentos vencidos o por vencer. */
  readonly alertasCuenta = computed(() => {
    const lista: { tono: 'rojo' | 'naranja'; titulo: string; texto: string; doc?: DocumentoConductor }[] = [];
    const d = this.desempeno();
    const p = this.perfil();
    if (d?.sancionado) {
      lista.push({
        tono: 'rojo',
        titulo: 'No estás recibiendo solicitudes',
        texto: `Tu tasa de cancelación es ${this.cancelacion()?.texto} y el máximo es ${d.limite_cancelacion} %. Completa más viajes sin cancelar para volver.`,
      });
    }
    if (p?.estado === 'suspendido') {
      lista.push({ tono: 'rojo', titulo: 'Tu cuenta está suspendida', texto: p.motivo_estado || 'Escríbenos en Ayuda para revisar tu caso.' });
    }
    if (p?.estado === 'pendiente') {
      lista.push({ tono: 'naranja', titulo: 'Tu cuenta está en revisión', texto: 'Estamos revisando tus documentos. Te avisamos apenas quede aprobada.' });
    }
    if (p?.estado === 'rechazado') {
      lista.push({ tono: 'rojo', titulo: 'Tu solicitud fue rechazada', texto: p.motivo_estado || 'Revisa tus documentos y vuelve a enviarlos.' });
    }
    for (const doc of p?.documentos ?? []) {
      const e = estadoDocumento(doc);
      if (!e.accion) continue;
      lista.push({ tono: e.clase === 'mal' ? 'rojo' : 'naranja', titulo: `${doc.nombre}: ${e.texto.toLowerCase()}`, texto: e.detalle, doc });
    }
    return lista;
  });

  ionViewDidEnter(): void {
    this.cargar();
    App.getInfo()
      .then((i) => this.version.set(i.version))
      .catch(() => undefined);
  }

  async refrescar(e: CustomEvent): Promise<void> {
    await this.cargar();
    (e.target as HTMLIonRefresherElement).complete();
  }

  irA(ruta: string): void {
    this.nav.navigateForward(ruta);
  }

  /** Ícono y una línea de cada servicio autorizado. */
  servicio(codigo: string): { icono: NombreIcono; texto: string } {
    if (codigo === 'domicilio') return { icono: 'domicilio', texto: 'Compras y entregas a la casa' };
    if (codigo === 'encomienda') return { icono: 'encomienda', texto: 'Paquetes de un punto a otro' };
    return { icono: this.perfil()?.vehiculo?.tipo_vehiculo === 'taxi' ? 'taxi' : 'moto', texto: 'Llevar pasajeros' };
  }

  // ---------- Sobre mí ----------

  editarSobreMi(): void {
    this.sobreMiTexto.set(this.perfil()?.sobre_mi ?? '');
    this.errorSobreMi.set('');
    this.editandoSobreMi.set(true);
  }

  async guardarSobreMi(): Promise<void> {
    const texto = this.sobreMiTexto().trim();
    if (texto.length > 160) return this.errorSobreMi.set('Escribe máximo 160 letras.');
    this.guardandoSobreMi.set(true);
    this.errorSobreMi.set('');
    try {
      const r = await this.datos.guardarSobreMi(texto);
      this.perfil.update((p) => (p ? { ...p, sobre_mi: r.sobre_mi || null } : p));
      this.editandoSobreMi.set(false);
      this.avisar(r.message);
    } catch (err) {
      this.errorSobreMi.set((err as ErrorApi).message || 'No pudimos guardar tu presentación.');
    } finally {
      this.guardandoSobreMi.set(false);
    }
  }

  // ---------- Ajustes ----------

  elegirNavegacion(app: AppNavegacion): void {
    guardarAppNavegacion(app);
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  }

  async activarNotificaciones(): Promise<void> {
    await this.push.activar();
    this.permisoPush.set(await this.push.permiso());
    if (this.permisoPush() === 'bloqueadas') this.avisar('Actívalas en Ajustes del celular › Aplicaciones › MoviFY › Notificaciones.');
  }

  async activarUbicacion(): Promise<void> {
    await this.gps.actualizar();
    if (this.ubicacion() === 'sin-permiso') this.avisar('Actívala en Ajustes del celular › Aplicaciones › MoviFY › Ubicación.');
  }

  // ---------- Seguridad ----------

  reportarIncidente(): void {
    this.nav.navigateForward('/conductor/ayuda', { queryParams: { tipo: 'incidente_seguridad' } });
  }

  async volverAVincular(d: Desvinculado): Promise<void> {
    if (!(await this.confirmar(`¿Volver a vincular a ${d.nombre}?`, 'Podrán volver a emparejarlos en un viaje.', 'Vincular'))) return;
    try {
      await this.datos.volverAVincular(d.id);
      this.desvinculados.update((l) => l.filter((x) => x.id !== d.id));
      this.avisar(`Listo, ${d.nombre} puede volver a aparecerte.`);
    } catch (err) {
      this.avisar((err as ErrorApi).message || 'No pudimos hacerlo. Intenta de nuevo.');
    }
  }

  // ---------- Foto ----------

  async cambiarFoto(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) return this.avisar('Elige una imagen (JPG o PNG).');
    if (archivo.size > 10 * 1024 * 1024) return this.avisar('La foto pesa más de 10 MB. Elige una más liviana.');
    this.subiendoFoto.set(true);
    try {
      await this.perfiles.subirFoto(archivo);
      this.avisar('Listo, cambiamos tu foto. Tus pasajeros la verán al aceptar un viaje.');
    } catch (err) {
      this.avisar((err as ErrorApi).message || 'No pudimos subir la foto.');
    } finally {
      this.subiendoFoto.set(false);
    }
  }

  // ---------- Documentos ----------

  renovar(d: DocumentoConductor): void {
    this.renovando.set(d);
    this.venceNueva.set('');
    this.errorRenovar.set('');
  }

  cerrarRenovar(): void {
    if (!this.enviandoDoc()) this.renovando.set(null);
  }

  avanceDoc(): number | null {
    const d = this.renovando();
    return d ? this.registro.subiendo(d.tipo_documento) : null;
  }

  async subirRenovado(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    const d = this.renovando();
    if (!archivo || !d) return;
    const pideFecha = !!d.fecha_vencimiento;
    if (pideFecha && !this.venceNueva()) return this.errorRenovar.set('Primero escribe la nueva fecha de vencimiento.');
    if (pideFecha && this.venceNueva() <= this.hoy) return this.errorRenovar.set('La nueva fecha debe ser después de hoy.');
    this.enviandoDoc.set(true);
    this.errorRenovar.set('');
    try {
      await this.registro.subir(d.tipo_documento, archivo, pideFecha ? this.venceNueva() : null);
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
      this.renovando.set(null);
      this.avisar(`Recibimos tu ${d.nombre}. Queda en revisión.`);
      this.perfil.set(await this.datos.perfil());
    } catch (err) {
      this.errorRenovar.set((err as ErrorApi).message || 'No pudimos subir el documento.');
    } finally {
      this.enviandoDoc.set(false);
    }
  }

  // ---------- Contactos de emergencia ----------

  escribirCelular(valor: string): string {
    const d = valor.replace(/\D/g, '').slice(0, 10);
    const bonito = [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
    this.contactoCelular.set(bonito);
    return bonito;
  }

  telefonoBonito(t: string): string {
    const d = t.replace(/^\+57/, '');
    return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
  }

  async guardarContacto(): Promise<void> {
    const nombre = this.contactoNombre().trim();
    const tel = this.contactoCelular().replace(/\D/g, '');
    if (!nombre) return this.errorContacto.set('Escribe el nombre del contacto.');
    if (!/^3\d{9}$/.test(tel)) return this.errorContacto.set('Escribe un celular de 10 dígitos que empiece por 3.');
    try {
      await this.perfiles.agregarContacto({ nombre, telefono: tel, parentesco: null });
      this.contactos.set(await this.perfiles.contactos());
      this.agregandoContacto.set(false);
      this.contactoNombre.set('');
      this.contactoCelular.set('');
      this.errorContacto.set('');
      this.avisar(`Agregamos a ${nombre}.`);
    } catch (err) {
      this.errorContacto.set((err as ErrorApi).message || 'No pudimos agregar el contacto.');
    }
  }

  async borrarContacto(c: ContactoEmergencia): Promise<void> {
    if (!(await this.confirmar(`¿Quitar a ${c.nombre}?`, 'Dejará de ser tu contacto de emergencia.', 'Quitar'))) return;
    try {
      await this.perfiles.borrarContacto(c.id);
      this.contactos.update((cs) => cs.filter((x) => x.id !== c.id));
    } catch (err) {
      this.avisar((err as ErrorApi).message || 'No pudimos quitar el contacto.');
    }
  }

  // ---------- Clave ----------

  soloNumeros(valor: string): string {
    return valor.replace(/\D/g, '').slice(0, 4);
  }

  async guardarClave(): Promise<void> {
    const actual = this.claveActual();
    const nueva = this.claveNueva();
    if (actual.length !== 4) return this.errorClave.set('Escribe tu clave actual (4 números).');
    if (nueva.length !== 4) return this.errorClave.set('La clave nueva debe tener 4 números.');
    if (claveDebil(nueva)) return this.errorClave.set('Esa clave es muy fácil de adivinar (como 1234 o 1111). Prueba con otra.');
    if (nueva !== this.claveRepetida()) return this.errorClave.set('Las dos claves nuevas no coinciden.');
    if (nueva === actual) return this.errorClave.set('La clave nueva es igual a la actual.');
    try {
      await this.perfiles.cambiarClave(actual, nueva);
      this.cambiandoClave.set(false);
      this.claveActual.set('');
      this.claveNueva.set('');
      this.claveRepetida.set('');
      this.errorClave.set('');
      this.avisar('Cambiamos tu clave. Úsala la próxima vez que entres.');
    } catch (err) {
      const msg = (err as ErrorApi).message || '';
      this.errorClave.set(msg.includes('actual') ? 'Tu clave actual no es correcta.' : msg || 'No pudimos cambiar la clave.');
    }
  }

  // ---------- Cuenta ----------

  /** Invitar a otros conductores (sin premios: no hay pagos en la app). */
  async invitar(): Promise<void> {
    const texto = '¿Tienes moto o taxi en Buenaventura? Maneja con MoviFY: recibes viajes y domicilios cerca y cobras en efectivo. Descarga la app y regístrate como conductor.';
    if (navigator.share) {
      await navigator.share({ text: texto }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(texto).catch(() => undefined);
      this.avisar('Copiamos la invitación. Pégala en WhatsApp.');
    }
  }

  async salir(): Promise<void> {
    if (!(await this.confirmar('¿Cerrar sesión?', 'Dejarás de recibir solicitudes en este celular.', 'Cerrar sesión'))) return;
    await this.api.post('/conductor/disponibilidad', { activo: false }).catch(() => undefined);
    this.enLinea.desconectar(); // apaga el GPS en segundo plano y la notificación "Estás en línea"
    this.sesion.cerrar();
    this.nav.navigateRoot('/inicio', { animationDirection: 'back' });
  }

  celularCambiado(): void {
    this.cambiandoCelular.set(false);
    this.avisar('Listo: tu celular quedó cambiado y verificado.');
    this.cargar();
  }

  /**
   * Eliminar la cuenta desde la app (Ley 1581 y requisito de Google Play). El backend no deja si hay un viaje
   * en curso; se pide escribir ELIMINAR para que no pase por un toque accidental.
   */
  async eliminarCuenta(): Promise<void> {
    const alerta = await this.alertas.create({
      header: '¿Eliminar tu cuenta?',
      message: 'Dejarás de ser conductor de MoviFY y borraremos tus datos personales, tus documentos y tus contactos. '
        + 'No se puede deshacer. Escribe ELIMINAR para confirmar.',
      inputs: [{ name: 'texto', type: 'text', placeholder: 'ELIMINAR' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar cuenta', role: 'destructive' },
      ],
    });
    await alerta.present();
    const r = await alerta.onDidDismiss<{ values: { texto: string } }>();
    if (r.role !== 'destructive') return;
    if ((r.data?.values?.texto ?? '').trim().toUpperCase() !== 'ELIMINAR') {
      this.avisar('No eliminamos tu cuenta: no escribiste ELIMINAR.');
      return;
    }
    try {
      await this.api.post('/conductor/disponibilidad', { activo: false }).catch(() => undefined);
      await this.perfiles.eliminarCuenta();
      this.enLinea.desconectar();
      this.nav.navigateRoot('/inicio', { animationDirection: 'back' });
    } catch (err) {
      this.avisar((err as ErrorApi).message || 'No pudimos eliminar la cuenta. Escríbenos en Ayuda.');
    }
  }

  // ---------- Utilidades ----------

  private async cargar(): Promise<void> {
    // Cada parte por separado: si falla el desempeño, igual se ven el vehículo y los documentos
    const [p, d, c, b] = await Promise.allSettled([
      this.datos.perfil(),
      this.datos.desempeno(),
      this.perfiles.contactos(),
      this.datos.desvinculados(),
    ]);
    this.push.permiso().then((x) => this.permisoPush.set(x));
    if (p.status === 'fulfilled') {
      this.perfil.set(p.value);
      this.error.set('');
    } else {
      this.error.set((p.reason as ErrorApi).message || 'No pudimos cargar tu perfil. Revisa tu internet.');
    }
    if (d.status === 'fulfilled') this.desempeno.set(d.value);
    if (c.status === 'fulfilled') this.contactos.set(c.value);
    if (b.status === 'fulfilled') this.desvinculados.set(b.value);
  }

  private async confirmar(header: string, message: string, si: string): Promise<boolean> {
    const a = await this.alertas.create({ header, message, buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: si, role: 'destructive' }] });
    await a.present();
    return (await a.onDidDismiss()).role === 'destructive';
  }

  private async avisar(mensaje: string): Promise<void> {
    const t = await this.avisos.create({ message: mensaje, duration: 2500, position: 'top', color: 'dark' });
    await t.present();
  }
}
