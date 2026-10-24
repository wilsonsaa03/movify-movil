import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { App } from '@capacitor/app';
import { ActivatedRoute } from '@angular/router';
import { AlertController, IonContent, IonFooter, NavController, ToastController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../../core/api.service';
import { SesionService } from '../../../core/sesion.service';
import { pesos, urlFoto } from '../../../core/formato';
import { IconoComponent, NombreIcono } from '../../../componentes/icono/icono.component';
import { BarraInferiorComponent } from '../../../componentes/barra-inferior/barra-inferior.component';
import { BuscadorLugarComponent } from '../../../componentes/buscador-lugar/buscador-lugar.component';
import { Lugar } from '../../../servicios/lugares.service';
import { ContactoEmergencia, LugarGuardado, Perfil, PerfilService, claveDebil } from '../../../servicios/perfil.service';
import { BARRA_CLIENTE } from '../inicio/cliente-inicio.page';

/** Etiquetas rápidas para un lugar nuevo (las mismas sugerencias del inicio). */
const ETIQUETAS = ['Casa', 'Trabajo', 'Donde mi mamá'];

/**
 * Mi perfil (cliente). Sin frame en el Figma: sigue el estilo de la app del cliente.
 * Foto, nombre y correo (el celular se cambia con código SMS, aquí solo se muestra), cuántos viajes y cuánto
 * ha pagado, lugares guardados, contactos de emergencia, cambiar la clave de 4 números, legal, cerrar sesión
 * y eliminar la cuenta. Con ?nuevo=Casa (desde "Tus lugares" del inicio) abre "agregar lugar".
 * Como el perfil de Uber: accesos rápidos (Ayuda, Mis pedidos, Seguridad), forma de pago (solo efectivo),
 * "Viaja seguro", invitar a un amigo y la versión de la app.
 */
@Component({
  selector: 'app-cliente-perfil',
  templateUrl: 'cliente-perfil.page.html',
  styleUrls: ['cliente-perfil.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, BarraInferiorComponent, BuscadorLugarComponent],
})
export class ClientePerfilPage implements ViewDidEnter {
  private readonly perfiles = inject(PerfilService);
  private readonly sesion = inject(SesionService);
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly alertas = inject(AlertController);
  private readonly avisos = inject(ToastController);

  readonly barra = BARRA_CLIENTE;
  readonly etiquetas = ETIQUETAS;
  readonly pesos = pesos;

  readonly perfil = signal<Perfil | null>(null);
  readonly lugares = signal<LugarGuardado[]>([]);
  readonly contactos = signal<ContactoEmergencia[]>([]);
  readonly error = signal('');
  readonly subiendoFoto = signal(false);
  /** Solo en el celular (App.getInfo no funciona en el navegador). */
  readonly version = signal('');
  private readonly seguridad = viewChild<ElementRef<HTMLElement>>('seguridad');

  // Editar datos
  readonly editando = signal(false);
  readonly nombres = signal('');
  readonly apellidos = signal('');
  readonly correo = signal('');
  readonly guardando = signal(false);
  readonly errorDatos = signal('');

  // Lugar nuevo: buscador → etiqueta → guardar
  readonly buscandoLugar = signal(false);
  readonly lugarNuevo = signal<Lugar | null>(null);
  readonly etiquetaNueva = signal('');
  readonly errorLugar = signal('');

  // Contacto nuevo
  readonly agregandoContacto = signal(false);
  readonly contactoNombre = signal('');
  readonly contactoCelular = signal('');
  readonly contactoParentesco = signal('');
  readonly errorContacto = signal('');

  // Clave
  readonly cambiandoClave = signal(false);
  readonly claveActual = signal('');
  readonly claveNueva = signal('');
  readonly claveRepetida = signal('');
  readonly errorClave = signal('');

  readonly foto = computed(() => urlFoto(this.perfil()?.foto ?? this.sesion.datos()?.foto));
  readonly nombre = computed(() => this.perfil()?.nombre ?? this.sesion.datos()?.nombre ?? '');
  readonly inicial = computed(() => this.nombre().trim().charAt(0).toUpperCase() || '?');
  readonly celular = computed(() => {
    const t = (this.perfil()?.telefono ?? '').replace(/^\+57/, '');
    return t.length === 10 ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}` : t;
  });
  readonly miembroDesde = computed(() => {
    const f = this.perfil()?.fecha_registro;
    return f ? new Date(f).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) : '';
  });
  readonly calificacion = computed(() => {
    const c = Number(this.perfil()?.calificacion);
    return c ? c.toFixed(1).replace('.', ',') : '—';
  });

  ionViewDidEnter(): void {
    this.cargar();
    App.getInfo()
      .then((i) => this.version.set(i.version))
      .catch(() => undefined);
    const nuevo = this.ruta.snapshot.queryParamMap.get('nuevo');
    if (nuevo) {
      this.etiquetaNueva.set(nuevo);
      this.buscandoLugar.set(true);
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
      const url = await this.perfiles.subirFoto(archivo);
      this.perfil.update((p) => (p ? { ...p, foto: url } : p));
      this.avisar('Listo, cambiamos tu foto.');
    } catch (err) {
      this.avisar((err as ErrorApi).message || 'No pudimos subir la foto.');
    } finally {
      this.subiendoFoto.set(false);
    }
  }

  // ---------- Datos ----------

  editar(): void {
    const p = this.perfil();
    if (!p) return;
    this.nombres.set(p.nombres ?? '');
    this.apellidos.set(p.apellidos ?? '');
    this.correo.set(p.correo ?? '');
    this.errorDatos.set('');
    this.editando.set(true);
  }

  async guardarDatos(): Promise<void> {
    const nombres = this.nombres().trim();
    const correo = this.correo().trim();
    if (!nombres) return this.errorDatos.set('Escribe tu nombre.');
    if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return this.errorDatos.set('Ese correo no se ve bien. Revísalo.');
    this.guardando.set(true);
    this.errorDatos.set('');
    try {
      const p = await this.perfiles.actualizar({ nombres, apellidos: this.apellidos().trim(), correo });
      this.perfil.update((viejo) => (viejo ? { ...viejo, ...p } : p));
      this.editando.set(false);
      this.avisar('Guardamos tus datos.');
    } catch (err) {
      this.errorDatos.set((err as ErrorApi).message || 'No pudimos guardar tus datos.');
    } finally {
      this.guardando.set(false);
    }
  }

  // ---------- Lugares ----------

  iconoLugar(etiqueta: string): NombreIcono {
    const e = etiqueta.toLowerCase();
    if (e.includes('casa')) return 'casa';
    if (e.includes('trabajo') || e.includes('oficina')) return 'trabajo';
    return 'corazon';
  }

  lugarElegido(l: Lugar): void {
    this.buscandoLugar.set(false);
    this.lugarNuevo.set(l);
    this.errorLugar.set('');
  }

  cancelarLugar(): void {
    this.lugarNuevo.set(null);
    this.etiquetaNueva.set('');
    this.errorLugar.set('');
  }

  async guardarLugar(): Promise<void> {
    const l = this.lugarNuevo();
    const etiqueta = this.etiquetaNueva().trim();
    if (!l) return;
    if (!etiqueta) return this.errorLugar.set('Ponle un nombre: Casa, Trabajo…');
    try {
      await this.perfiles.guardarLugar({
        etiqueta,
        direccion: l.detalle ? `${l.nombre}, ${l.detalle}` : l.nombre,
        barrio: l.barrio,
        referencia: null,
        lat: l.lat,
        lng: l.lng,
      });
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
      this.cancelarLugar();
      this.lugares.set(await this.perfiles.lugares());
      this.avisar(`Guardamos "${etiqueta}".`);
    } catch (err) {
      this.errorLugar.set((err as ErrorApi).message || 'No pudimos guardar el lugar.');
    }
  }

  async borrarLugar(l: LugarGuardado): Promise<void> {
    if (!(await this.confirmar(`¿Borrar "${l.etiqueta}"?`, 'Ya no aparecerá en tus lugares.', 'Borrar'))) return;
    try {
      await this.perfiles.borrarLugar(l.id);
      this.lugares.update((ls) => ls.filter((x) => x.id !== l.id));
    } catch (err) {
      this.avisar((err as ErrorApi).message || 'No pudimos borrar el lugar.');
    }
  }

  // ---------- Contactos de emergencia ----------

  escribirCelular(valor: string): string {
    const d = valor.replace(/\D/g, '').slice(0, 10);
    const bonito = [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
    this.contactoCelular.set(bonito);
    return bonito;
  }

  async guardarContacto(): Promise<void> {
    const nombre = this.contactoNombre().trim();
    const tel = this.contactoCelular().replace(/\D/g, '');
    if (!nombre) return this.errorContacto.set('Escribe el nombre del contacto.');
    if (!/^(3\d{9}|60\d{8})$/.test(tel)) return this.errorContacto.set('Escribe un celular de 10 dígitos que empiece por 3.');
    try {
      await this.perfiles.agregarContacto({ nombre, telefono: tel, parentesco: this.contactoParentesco().trim() || null });
      this.contactos.set(await this.perfiles.contactos());
      this.agregandoContacto.set(false);
      this.contactoNombre.set('');
      this.contactoCelular.set('');
      this.contactoParentesco.set('');
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

  telefonoBonito(t: string): string {
    const d = t.replace(/^\+57/, '');
    return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
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

  irA(ruta: string): void {
    this.nav.navigateForward(ruta);
  }

  /** El cuadro "Seguridad" baja hasta los contactos de emergencia. */
  verSeguridad(): void {
    this.seguridad()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Invitar a un amigo: comparte el texto con WhatsApp u otra app (sin premios: no hay pagos en la app). */
  async invitar(): Promise<void> {
    const texto = 'Te invito a MoviFY: pide taxi, moto, domicilios y encomiendas en Buenaventura desde tu celular.';
    if (navigator.share) {
      await navigator.share({ text: texto }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(texto).catch(() => undefined);
      this.avisar('Copiamos la invitación. Pégala en WhatsApp.');
    }
  }

  async cerrarSesion(): Promise<void> {
    if (!(await this.confirmar('¿Cerrar sesión?', 'Para volver a pedir servicios tendrás que entrar con tu celular y tu clave.', 'Cerrar sesión'))) return;
    this.sesion.cerrar();
    this.nav.navigateRoot('/inicio', { animationDirection: 'back' });
  }

  async eliminarCuenta(): Promise<void> {
    const alerta = await this.alertas.create({
      header: '¿Eliminar tu cuenta?',
      message: 'Borraremos tus datos personales, tus lugares y tus contactos. No se puede deshacer. Escribe ELIMINAR para confirmar.',
      inputs: [{ name: 'texto', type: 'text', placeholder: 'ELIMINAR' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar cuenta', role: 'destructive' },
      ],
    });
    await alerta.present();
    const r = await alerta.onDidDismiss<{ values: { texto: string } }>();
    if (r.role !== 'destructive') return;
    if ((r.data?.values?.texto ?? '').trim().toUpperCase() !== 'ELIMINAR') return this.avisar('No eliminamos tu cuenta: no escribiste ELIMINAR.');
    try {
      await this.perfiles.eliminarCuenta();
      this.nav.navigateRoot('/inicio', { animationDirection: 'back' });
    } catch (err) {
      this.avisar((err as ErrorApi).message || 'No pudimos eliminar la cuenta. Escríbenos a soporte.');
    }
  }

  // ---------- Utilidades ----------

  private async cargar(): Promise<void> {
    try {
      const [p, l, c] = await Promise.all([this.perfiles.perfil(), this.perfiles.lugares(), this.perfiles.contactos()]);
      this.perfil.set(p);
      this.lugares.set(l);
      this.contactos.set(c);
      this.error.set('');
    } catch (err) {
      this.error.set((err as ErrorApi).message || 'No pudimos cargar tu perfil. Revisa tu internet.');
    }
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
