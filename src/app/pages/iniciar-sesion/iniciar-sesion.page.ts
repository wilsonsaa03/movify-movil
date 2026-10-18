import { AfterViewInit, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonRouterOutlet, NavController, Platform, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Subscription } from 'rxjs';
import { HeroCieloComponent } from '../../componentes/hero-cielo/hero-cielo.component';
import { CampoCelularComponent } from '../../componentes/campo-celular/campo-celular.component';
import { ErrorApi } from '../../core/api.service';
import { GoogleAuthService } from '../../servicios/google-auth.service';

/** cargando → listo (botón oficial) → entrando; sin-google = no cargó; nativo = APK (aún sin plugin). */
type EstadoGoogle = 'cargando' | 'listo' | 'entrando' | 'sin-google' | 'nativo';

/**
 * Iniciar sesión.
 *  - Con el número de celular (método principal). Paso 1 de 2: el paso 2 (la clave de 4 dígitos) es /login/clave.
 *    Aquí no se llama al backend: solo se valida y se pasa el número a la siguiente pantalla.
 *  - Con Google, aquí mismo: el botón oficial de Google entrega un id_token → POST /api/auth/login-google
 *    (el mismo flujo de la web). En el APK todavía no hay plugin nativo: se abre /login/google, que lo explica.
 *
 * Atrás (flecha o botón del celular) sin pantalla anterior en la app → /inicio, nunca sale de la app.
 * Si llega con ?expirada=1 (el refresh token ya no sirvió) muestra "Tu sesión venció".
 */
@Component({
  selector: 'app-iniciar-sesion',
  templateUrl: 'iniciar-sesion.page.html',
  styleUrls: ['iniciar-sesion.page.scss'],
  imports: [IonContent, HeroCieloComponent, CampoCelularComponent],
})
export class IniciarSesionPage implements AfterViewInit, ViewDidEnter, ViewWillLeave {
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly nav = inject(NavController);
  private readonly plataforma = inject(Platform);
  private readonly salida = inject(IonRouterOutlet, { optional: true });
  private readonly google = inject(GoogleAuthService);
  private readonly contenedorGoogle = viewChild.required<ElementRef<HTMLElement>>('botonGoogle');
  private botonAtras?: Subscription;

  /** Servicio que el usuario tocó en la pantalla de inicio (taxi, moto...), si vino de ahí. */
  private readonly servicio = this.ruta.snapshot.queryParamMap.get('servicio');

  /** Solo los dígitos, sin espacios. Ej: "3001234567" */
  readonly digitos = signal((this.ruta.snapshot.queryParamMap.get('celular') ?? '').replace(/\D/g, '').slice(0, 10));
  readonly intentoEnviar = signal(false);

  /** Llegó aquí porque la sesión venció (lo manda ApiService). */
  readonly sesionVencida = this.ruta.snapshot.queryParamMap.has('expirada');

  /** Celular colombiano: 10 dígitos y empieza por 3. */
  readonly valido = computed(() => /^3\d{9}$/.test(this.digitos()));

  readonly error = computed(() => {
    if (!this.intentoEnviar()) return '';
    const d = this.digitos();
    if (d.length === 0) return 'Escribe tu número de celular.';
    if (!d.startsWith('3')) return 'Los celulares en Colombia empiezan por 3.';
    if (d.length < 10) return `Faltan ${10 - d.length} dígitos.`;
    return '';
  });

  readonly estadoGoogle = signal<EstadoGoogle>(this.google.disponible() ? 'cargando' : 'nativo');
  readonly errorGoogle = signal('');

  ngAfterViewInit(): void {
    if (this.estadoGoogle() !== 'nativo') this.prepararGoogle();
  }

  /** Botón "atrás" de Android: sin pantalla anterior, en vez de cerrar la app vuelve al inicio. */
  ionViewDidEnter(): void {
    this.botonAtras = this.plataforma.backButton.subscribeWithPriority(10, (siguiente) => {
      if (this.salida?.canGoBack()) siguiente(); // deja que Ionic haga el "atrás" normal
      else this.alInicio();
    });
  }

  ionViewWillLeave(): void {
    this.botonAtras?.unsubscribe();
  }

  alInicio(): void {
    this.nav.navigateBack('/inicio');
  }

  continuar(): void {
    this.intentoEnviar.set(true);
    if (!this.valido()) return;

    const queryParams: Record<string, string> = { celular: this.digitos() };
    if (this.servicio) queryParams['servicio'] = this.servicio;
    this.router.navigate(['/login/clave'], { queryParams });
  }

  /** Dibuja el botón oficial de Google; al elegir una cuenta, entra directo. */
  async prepararGoogle(): Promise<void> {
    this.estadoGoogle.set('cargando');
    this.errorGoogle.set('');
    try {
      await this.google.mostrarBoton(this.contenedorGoogle().nativeElement, (token) => this.entrarConGoogle(token));
      this.estadoGoogle.set('listo');
    } catch {
      this.estadoGoogle.set('sin-google');
      this.errorGoogle.set('No pudimos cargar Google. Revisa tu internet.');
    }
  }

  async entrarConGoogle(idToken: string): Promise<void> {
    if (this.estadoGoogle() === 'entrando') return;
    this.estadoGoogle.set('entrando');
    this.errorGoogle.set('');
    try {
      await this.google.entrar(idToken, this.servicio);
    } catch (e) {
      Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
      this.errorGoogle.set((e as ErrorApi).message || 'No pudimos entrar con Google.');
      this.estadoGoogle.set('listo');
    }
  }

  /** Solo en el APK (sin botón oficial todavía): pantalla que explica y ofrece entrar con el celular. */
  conGoogle(): void {
    this.router.navigate(['/login/google'], { queryParams: this.servicio ? { servicio: this.servicio } : {} });
  }

  irARegistro(): void {
    this.router.navigateByUrl('/registro');
  }
}
