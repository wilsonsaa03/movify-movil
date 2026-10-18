import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { HeroCieloComponent } from '../../componentes/hero-cielo/hero-cielo.component';
import { CampoCelularComponent } from '../../componentes/campo-celular/campo-celular.component';

/**
 * Iniciar sesión con el número de celular (el método principal de MoviFY).
 * Paso 1 de 2: aquí se escribe el número; el paso 2 (la clave de 4 dígitos) es /login/clave.
 *
 * Aquí no se llama al backend: solo se valida y se pasa el número a la siguiente pantalla.
 * Si llega con ?expirada=1 (el refresh token ya no sirvió) muestra "Tu sesión venció".
 */
@Component({
  selector: 'app-iniciar-sesion',
  templateUrl: 'iniciar-sesion.page.html',
  styleUrls: ['iniciar-sesion.page.scss'],
  imports: [IonContent, HeroCieloComponent, CampoCelularComponent],
})
export class IniciarSesionPage {
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

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

  continuar(): void {
    this.intentoEnviar.set(true);
    if (!this.valido()) return;

    const queryParams: Record<string, string> = { celular: this.digitos() };
    if (this.servicio) queryParams['servicio'] = this.servicio;
    this.router.navigate(['/login/clave'], { queryParams });
  }

  conGoogle(): void {
    this.router.navigate(['/login/google'], { queryParams: this.servicio ? { servicio: this.servicio } : {} });
  }

  irARegistro(): void {
    this.router.navigateByUrl('/registro');
  }
}
