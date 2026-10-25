import { Injectable, inject } from '@angular/core';
import { NavController, ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ActionPerformed, PushNotificationSchema, PushNotifications, Token } from '@capacitor/push-notifications';
import { ApiService } from './api.service';
import { SesionService } from './sesion.service';

/** Aquí queda el token del celular para darlo de baja al cerrar sesión (lo lee ApiService.cerrarSesion). */
export const CLAVE_TOKEN_PUSH = 'movify.push.token';

/** Datos que manda el backend en cada push (NotificacionServicio). */
interface DatosPush {
  evento?: string;
  servicio_id?: string;
}

/**
 * Notificaciones push (Firebase Cloud Messaging) en la app instalada:
 *  - Pide el permiso y registra el token del celular en el backend (POST /usuarios/dispositivos).
 *  - Con la app abierta muestra el aviso arriba y vibra (el sondeo de cada pantalla ya trae el cambio).
 *  - Al tocar un aviso con la app cerrada lleva a la pantalla que toca (nueva solicitud, chat, viaje…).
 * En el navegador no hace nada: ahí siguen funcionando el sondeo y los avisos dentro de la app.
 *
 * Requiere android/app/google-services.json (Firebase) y, en el backend, FCM_CREDENCIALES.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly nav = inject(NavController);
  private readonly avisos = inject(ToastController);
  private iniciado = false;

  async iniciar(): Promise<void> {
    if (this.iniciado || !Capacitor.isNativePlatform() || !this.sesion.datos()) return;
    this.iniciado = true;
    try {
      let permiso = await PushNotifications.checkPermissions();
      if (permiso.receive === 'prompt' || permiso.receive === 'prompt-with-rationale') {
        permiso = await PushNotifications.requestPermissions();
      }
      if (permiso.receive !== 'granted') return;

      if (Capacitor.getPlatform() === 'android') {
        // Canal con prioridad alta: suena aunque el celular esté en reposo (el conductor tiene segundos para aceptar)
        await PushNotifications.createChannel({
          id: 'viajes',
          name: 'Viajes y solicitudes',
          description: 'Conductor asignado, llegó, nuevas solicitudes y mensajes',
          importance: 5,
          visibility: 1,
          vibration: true,
        });
      }

      await PushNotifications.addListener('registration', (t: Token) => this.guardarToken(t.value));
      await PushNotifications.addListener('registrationError', () => undefined);
      await PushNotifications.addListener('pushNotificationReceived', (n: PushNotificationSchema) => this.enPrimerPlano(n));
      await PushNotifications.addListener('pushNotificationActionPerformed', (a: ActionPerformed) =>
        this.abrir(a.notification.data as DatosPush),
      );
      await PushNotifications.register();
    } catch {
      this.iniciado = false; // sin Firebase configurado: la app sigue funcionando con el sondeo
    }
  }

  private async guardarToken(token: string): Promise<void> {
    try {
      localStorage.setItem(CLAVE_TOKEN_PUSH, token);
    } catch {
      /* almacenamiento bloqueado: igual se registra */
    }
    await this.api
      .post('/usuarios/dispositivos', { plataforma: Capacitor.getPlatform(), token_push: token, modelo: null, version_app: null })
      .catch(() => undefined);
  }

  private async enPrimerPlano(n: PushNotificationSchema): Promise<void> {
    Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
    const datos = n.data as DatosPush;
    const t = await this.avisos.create({
      header: n.title,
      message: n.body,
      duration: 5000,
      position: 'top',
      color: 'dark',
      buttons: datos?.evento ? [{ text: 'Ver', handler: () => this.abrir(datos) }] : undefined,
    });
    await t.present();
  }

  /** A qué pantalla lleva cada aviso según quién lo recibe. */
  abrir(datos: DatosPush | null | undefined): void {
    const ruta = rutaDelAviso(datos, this.sesion.datos()?.rol === 'conductor');
    if (ruta) this.nav.navigateRoot(ruta.ruta, { queryParams: ruta.params });
  }
}

/**
 * Conductor: nueva solicitud → la solicitud; mensaje → chat; lo demás → su inicio (retoma el viaje en curso).
 * Cliente: mensaje → chat; terminó → calificar; programado → mis pedidos; lo demás → "Buscando", que lleva al
 * seguimiento que corresponda según el estado y el tipo de servicio.
 */
export function rutaDelAviso(datos: DatosPush | null | undefined, conductor: boolean): { ruta: string; params?: Record<string, number> } | null {
  const id = Number(datos?.servicio_id) || 0;
  const evento = datos?.evento ?? '';
  if (conductor) {
    if (evento === 'solicitud' && id) return { ruta: '/conductor/viaje/solicitud', params: { id } };
    if (evento === 'mensaje' && id) return { ruta: '/conductor/viaje/chat', params: { id } };
    return { ruta: '/conductor/inicio' };
  }
  if (evento === 'programado') return { ruta: '/cliente/pedidos' };
  if (!id) return { ruta: '/cliente' };
  if (evento === 'mensaje') return { ruta: '/cliente/viaje/chat', params: { id } };
  if (evento === 'finalizado') return { ruta: '/cliente/viaje/calificar', params: { id } };
  if (evento === 'cancelado') return { ruta: '/cliente/pedidos/detalle', params: { id } };
  return { ruta: '/cliente/viaje/buscando', params: { id } };
}
