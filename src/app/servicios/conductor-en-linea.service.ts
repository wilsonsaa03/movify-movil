import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';
import { environment } from '../../environments/environment';
import { ApiService } from '../core/api.service';
import { SesionService } from '../core/sesion.service';
import { sonarSolicitud } from '../core/sonido-solicitud';
import { UbicacionService } from './ubicacion.service';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/** Cada cuánto se busca una solicitud nueva y se manda la ubicación (también desde el GPS nativo). */
const CADA_MS = 8000;
const CANAL = 'solicitudes';

interface Disponible {
  servicio_id: number;
  tipo_servicio?: string;
  /** Dirección de recogida. */
  origen?: string | null;
  tarifa?: number | string | null;
}

/**
 * El conductor "en línea", aunque la app esté en segundo plano o con la pantalla apagada:
 *
 *  - GPS: en el celular usa el GPS nativo con un servicio en primer plano (Android lo exige y muestra la
 *    notificación fija "Estás en línea"); en el navegador, el GPS normal. La ubicación se manda con HTTP nativo
 *    (CapacitorHttp): Android frena las peticiones del WebView después de 5 minutos en segundo plano.
 *  - Solicitudes: las busca cada 8 s. Con la app abierta suena un timbre, vibra y abre la solicitud; en
 *    segundo plano sale una notificación del sistema con sonido que, al tocarla, abre la solicitud.
 *  - En un viaje o viendo una solicitud se pausa la búsqueda (el GPS sigue, para que el pasajero vea el carro).
 *
 * Con la app cerrada del todo solo llegan los push de Firebase (falta google-services.json).
 */
@Injectable({ providedIn: 'root' })
export class ConductorEnLineaService {
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly gps = inject(UbicacionService);
  private readonly router = inject(Router);
  private readonly zona = inject(NgZone);

  readonly nativo = Capacitor.isNativePlatform();
  /** El GPS nativo no tiene permiso: la pantalla muestra cómo activarlo. */
  readonly sinPermiso = signal(false);

  private usosGps = 0;
  private vigilante: string | null = null;
  private iniciando: Promise<void> | null = null;
  private buscando = false;
  private pausas = 0;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private ultimoEnvio = 0;
  private ultimaBusqueda = 0;
  private ultimaAvisada: number | null = null;
  private enPrimerPlano = true;
  private preparado = false;

  // ─────────────── En línea (inicio del conductor) ───────────────

  /** Se conectó: GPS en segundo plano + búsqueda de solicitudes. Se puede llamar varias veces. */
  async conectar(): Promise<void> {
    this.preparar();
    if (!this.buscando) {
      this.buscando = true;
      this.mantenerGps();
    }
    if (!this.reloj) {
      this.reloj = setInterval(() => this.vuelta(), CADA_MS);
      this.vuelta();
    }
  }

  desconectar(): void {
    if (this.buscando) {
      this.buscando = false;
      this.soltarGps();
    }
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
    this.ultimaAvisada = null;
  }

  /** Viendo una solicitud o en un viaje: no buscar otras (se llama en pares con reanudar). */
  pausar(): void {
    this.pausas++;
  }

  reanudar(): void {
    this.pausas = Math.max(0, this.pausas - 1);
  }

  // ─────────────── GPS (también lo usa el viaje en curso) ───────────────

  /** Mantiene el GPS encendido (cuenta cuántos lo piden: estar en línea y estar en un viaje). */
  mantenerGps(): void {
    this.usosGps++;
    if (this.nativo) {
      this.iniciando ??= this.encenderNativo().finally(() => (this.iniciando = null));
    }
  }

  soltarGps(): void {
    this.usosGps = Math.max(0, this.usosGps - 1);
    if (this.usosGps === 0 && this.vigilante) {
      const id = this.vigilante;
      this.vigilante = null;
      BackgroundGeolocation.removeWatcher({ id }).catch(() => undefined);
    }
  }

  /** Abre los ajustes de la app para dar el permiso de ubicación "Permitir siempre". */
  abrirAjustes(): void {
    if (this.nativo) BackgroundGeolocation.openSettings().catch(() => undefined);
  }

  private async encenderNativo(): Promise<void> {
    if (this.vigilante || this.usosGps === 0) return;
    await LocalNotifications.requestPermissions().catch(() => undefined); // Android 13+: la notificación fija
    try {
      this.vigilante = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: 'MoviFY · Estás en línea',
          backgroundMessage: 'Compartimos tu ubicación para enviarte viajes cerca y para que el pasajero te vea llegar.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 10,
        },
        (pos, error) => this.zona.run(() => {
          if (error) {
            if (error.code === 'NOT_AUTHORIZED') this.sinPermiso.set(true);
            return;
          }
          if (pos) this.recibir(pos);
        }),
      );
      this.sinPermiso.set(false);
      if (this.usosGps === 0) this.soltarGps(); // lo soltaron mientras arrancaba
    } catch {
      this.vigilante = null;
    }
  }

  private recibir(p: Location): void {
    this.gps.aplicarExterna(p.latitude, p.longitude, Number.isFinite(p.accuracy) ? Math.round(p.accuracy) : null);
    // En segundo plano el reloj de JavaScript puede frenarse: el GPS nativo también empuja la vuelta
    if (Date.now() - this.ultimoEnvio >= CADA_MS - 500) this.vuelta();
  }

  // ─────────────── Cada vuelta: ubicación + solicitudes ───────────────

  private async vuelta(): Promise<void> {
    const u = this.gps.ubicacion();
    if (u && Date.now() - this.ultimoEnvio >= CADA_MS - 500) {
      this.ultimoEnvio = Date.now();
      await this.pedir('POST', '/conductor/ubicacion', { lat: u.lat, lng: u.lng }).catch(() => undefined);
    }
    if (!this.buscando || this.pausas > 0 || Date.now() - this.ultimaBusqueda < CADA_MS - 500) return;
    this.ultimaBusqueda = Date.now();
    const lista = await this.pedir<Disponible[]>('GET', '/servicios/disponibles').catch(() => null);
    const nueva = lista?.[0];
    if (!nueva || nueva.servicio_id === this.ultimaAvisada || !this.buscando || this.pausas > 0) return;
    this.ultimaAvisada = nueva.servicio_id;
    this.avisar(nueva);
  }

  private avisar(s: Disponible): void {
    Haptics.vibrate({ duration: 600 }).catch(() => undefined);
    if (this.enPrimerPlano) {
      sonarSolicitud();
      this.abrirSolicitud(s.servicio_id);
      return;
    }
    const que = s.tipo_servicio === 'domicilio' ? 'Nuevo domicilio' : s.tipo_servicio === 'encomienda' ? 'Nueva encomienda' : 'Nuevo viaje';
    const tarifa = Number(s.tarifa);
    LocalNotifications.schedule({
      notifications: [{
        id: s.servicio_id % 2_000_000_000,
        title: `🛵 ${que} cerca de ti`,
        body: [s.origen, tarifa ? '$' + tarifa.toLocaleString('es-CO') : null].filter(Boolean).join(' · ')
          || 'Toca para ver la solicitud antes de que se acabe el tiempo.',
        channelId: CANAL,
        smallIcon: 'ic_movify_aviso',
        extra: { servicio_id: s.servicio_id },
      }],
    }).catch(() => undefined);
  }

  private abrirSolicitud(id: number): void {
    this.router.navigate(['/conductor/viaje/solicitud'], { queryParams: { id } });
  }

  // ─────────────── Una sola vez: canal, toques en la notificación, primer plano ───────────────

  private preparar(): void {
    if (this.preparado || !this.nativo) return;
    this.preparado = true;
    LocalNotifications.createChannel({
      id: CANAL,
      name: 'Solicitudes de viaje',
      description: 'Suena cuando hay un viaje, domicilio o encomienda cerca',
      importance: 5,
      visibility: 1,
      vibration: true,
    }).catch(() => undefined);
    LocalNotifications.addListener('localNotificationActionPerformed', (a) => this.zona.run(() => {
      const id = Number(a.notification.extra?.servicio_id);
      if (id) this.abrirSolicitud(id);
    })).catch(() => undefined);
    App.addListener('appStateChange', (e) => (this.enPrimerPlano = e.isActive)).catch(() => undefined);
  }

  /** En el celular, HTTP nativo (no lo frena Android en segundo plano); en el navegador, el ApiService. */
  private async pedir<T>(metodo: 'GET' | 'POST', ruta: string, datos?: unknown): Promise<T> {
    if (!this.nativo) {
      return metodo === 'GET' ? this.api.get<T>(ruta) : this.api.post<T>(ruta, datos);
    }
    for (let intento = 0; intento < 2; intento++) {
      const r = await CapacitorHttp.request({
        method: metodo,
        url: environment.apiUrl + ruta,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.sesion.token ?? ''}`, 'X-Plataforma': 'android' },
        data: datos,
      });
      if (r.status === 401 && intento === 0 && (await this.api.renovarSesion())) continue;
      if (r.status >= 400) throw new Error(String(r.status));
      return r.data as T;
    }
    throw new Error('401');
  }
}
