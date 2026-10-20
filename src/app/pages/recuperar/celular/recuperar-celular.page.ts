import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { CampoCelularComponent } from '../../../componentes/campo-celular/campo-celular.component';
import { RecuperarService } from '../../../servicios/recuperar.service';
import { ErrorApi } from '../../../core/api.service';

/** Recuperar clave · Paso 1 de 4: el celular de la cuenta (le llega un SMS). */
@Component({
  selector: 'app-recuperar-celular',
  templateUrl: 'recuperar-celular.page.html',
  styleUrls: ['recuperar-celular.page.scss'],
  imports: [IonContent, HeroCieloComponent, CampoCelularComponent],
})
export class RecuperarCelularPage {
  private readonly nav = inject(NavController);
  private readonly ruta = inject(ActivatedRoute);
  private readonly recuperar = inject(RecuperarService);

  /** Si viene de "Olvidé mi clave", el número ya está escrito. */
  readonly digitos = signal((this.ruta.snapshot.queryParamMap.get('celular') ?? '').replace(/\D/g, '').slice(0, 10));
  readonly intentoEnviar = signal(false);
  readonly enviando = signal(false);
  readonly errorServidor = signal('');

  readonly valido = computed(() => /^3\d{9}$/.test(this.digitos()));
  readonly error = computed(() => {
    if (this.errorServidor()) return this.errorServidor();
    if (!this.intentoEnviar()) return '';
    const d = this.digitos();
    if (d.length === 0) return 'Escribe tu número de celular.';
    if (!d.startsWith('3')) return 'Los celulares en Colombia empiezan por 3.';
    if (d.length < 10) return `Faltan ${10 - d.length} dígitos.`;
    return '';
  });

  constructor() {
    this.recuperar.iniciar();
  }

  cambio(d: string): void {
    this.digitos.set(d);
    this.errorServidor.set('');
  }

  async enviarCodigo(): Promise<void> {
    this.intentoEnviar.set(true);
    if (!this.valido() || this.enviando()) return;
    this.enviando.set(true);
    this.errorServidor.set('');
    try {
      await this.recuperar.enviarCodigo(this.digitos());
      this.nav.navigateForward('/login/recuperar/codigo');
    } catch (e) {
      this.errorServidor.set((e as ErrorApi).message);
    } finally {
      this.enviando.set(false);
    }
  }

  /** "¿Ya la recordaste? Ingresa tu clave" */
  irAClave(): void {
    if (this.valido()) {
      this.nav.navigateBack('/login/clave', { queryParams: { celular: this.digitos() } });
    } else {
      this.nav.navigateBack('/login');
    }
  }
}
