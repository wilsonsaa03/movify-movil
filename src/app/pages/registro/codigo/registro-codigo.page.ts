import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { TecladoNumericoComponent } from '../../../componentes/teclado-numerico/teclado-numerico.component';
import { RegistroService } from '../../../servicios/registro.service';
import { ErrorApi } from '../../../core/api.service';

const LARGO = 6;
const ESPERA_REENVIO = 45; // segundos

/** Registro · Paso 2 de 4: el código de 6 dígitos que llega por SMS. */
@Component({
  selector: 'app-registro-codigo',
  templateUrl: 'registro-codigo.page.html',
  styleUrls: ['registro-codigo.page.scss'],
  imports: [IonContent, HeroCieloComponent, TecladoNumericoComponent],
})
export class RegistroCodigoPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);
  readonly registro = inject(RegistroService);

  readonly codigo = signal('');
  readonly casillas = computed(() => Array.from({ length: LARGO }, (_, i) => this.codigo()[i] ?? ''));
  readonly completo = computed(() => this.codigo().length === LARGO);

  readonly verificando = signal(false);
  readonly error = signal('');
  readonly sacudir = signal(false);

  readonly segundos = signal(ESPERA_REENVIO);
  readonly reenviando = signal(false);
  private reloj?: ReturnType<typeof setInterval>;

  constructor() {
    this.iniciarReloj();
  }

  ngOnDestroy(): void {
    clearInterval(this.reloj);
  }

  /** "0:45" */
  readonly cuentaRegresiva = computed(() => `0:${String(this.segundos()).padStart(2, '0')}`);

  agregar(d: string): void {
    if (this.verificando() || this.completo()) return;
    this.error.set('');
    this.codigo.update((c) => c + d);
    if (this.completo()) this.verificar(); // se verifica solo al escribir el último dígito
  }

  quitar(): void {
    if (this.verificando()) return;
    this.error.set('');
    this.codigo.update((c) => c.slice(0, -1));
  }

  /** Si copian el código del SMS y lo pegan, se llena solo. */
  @HostListener('window:paste', ['$event'])
  alPegar(e: ClipboardEvent): void {
    const numeros = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, LARGO);
    if (numeros.length === LARGO) {
      this.codigo.set(numeros);
      this.verificar();
    }
  }

  async verificar(): Promise<void> {
    if (!this.completo() || this.verificando()) return;
    this.verificando.set(true);
    try {
      await this.registro.verificarCodigo(this.codigo());
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
      this.router.navigateByUrl('/registro/datos');
    } catch (e) {
      Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
      this.error.set((e as ErrorApi).message);
      this.sacudir.set(true);
      setTimeout(() => {
        this.sacudir.set(false);
        this.codigo.set('');
      }, 420);
    } finally {
      this.verificando.set(false);
    }
  }

  async reenviar(): Promise<void> {
    if (this.segundos() > 0 || this.reenviando()) return;
    this.reenviando.set(true);
    try {
      await this.registro.enviarCodigo(this.registro.celular());
      this.codigo.set('');
      this.error.set('');
      this.iniciarReloj();
    } catch (e) {
      this.error.set((e as ErrorApi).message);
    } finally {
      this.reenviando.set(false);
    }
  }

  cambiarNumero(): void {
    this.nav.navigateBack('/registro/celular');
  }

  private iniciarReloj(): void {
    clearInterval(this.reloj);
    this.segundos.set(ESPERA_REENVIO);
    this.reloj = setInterval(() => {
      this.segundos.update((s) => Math.max(s - 1, 0));
      if (this.segundos() === 0) clearInterval(this.reloj);
    }, 1000);
  }
}
