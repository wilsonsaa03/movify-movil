import { AfterViewInit, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { HeroCieloComponent } from '../../componentes/hero-cielo/hero-cielo.component';
import { ApiService, ErrorApi } from '../../core/api.service';
import { RespuestaSesion, SesionService } from '../../core/sesion.service';
import { GoogleAuthService } from '../../servicios/google-auth.service';

type Estado = 'cargando' | 'listo' | 'entrando' | 'sin-google' | 'nativo';

/**
 * Entrar (o crear la cuenta) con Google.
 *
 * Google entrega un id_token → POST /api/auth/login-google { token } → el backend lo verifica
 * con Google y responde con la sesión de MoviFY (JWT + refresh), igual que /auth/login-celular.
 * Si el correo ya tenía cuenta, la vincula; si no, crea una cuenta de cliente.
 */
@Component({
  selector: 'app-login-google',
  templateUrl: 'login-google.page.html',
  styleUrls: ['login-google.page.scss'],
  imports: [IonContent, HeroCieloComponent],
})
export class LoginGooglePage implements AfterViewInit {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly sesion = inject(SesionService);
  private readonly google = inject(GoogleAuthService);

  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('botonGoogle');
  private readonly servicio = this.ruta.snapshot.queryParamMap.get('servicio');

  readonly estado = signal<Estado>(this.google.disponible() ? 'cargando' : 'nativo');
  readonly error = signal('');

  ngAfterViewInit(): void {
    if (this.estado() !== 'nativo') this.prepararBoton();
  }

  async prepararBoton(): Promise<void> {
    this.estado.set('cargando');
    this.error.set('');
    try {
      await this.google.mostrarBoton(this.contenedor().nativeElement, (token) => this.entrar(token));
      this.estado.set('listo');
    } catch {
      this.estado.set('sin-google');
      this.error.set('No pudimos cargar Google. Revisa tu internet e intenta de nuevo.');
    }
  }

  async entrar(idToken: string): Promise<void> {
    if (this.estado() === 'entrando') return;
    this.estado.set('entrando');
    this.error.set('');
    try {
      const r = await this.api.post<RespuestaSesion>('/auth/login-google', { token: idToken });
      this.sesion.guardar(r);
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      this.nav.navigateRoot(this.sesion.rutaInicio(), { queryParams: this.servicio ? { servicio: this.servicio } : {} });
    } catch (e) {
      Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
      this.error.set((e as ErrorApi).message);
      this.estado.set('listo');
    }
  }

  conCelular(): void {
    this.nav.navigateBack('/login', { queryParams: this.servicio ? { servicio: this.servicio } : {} });
  }

  ir(ruta: string): void {
    this.nav.navigateForward(ruta);
  }
}
