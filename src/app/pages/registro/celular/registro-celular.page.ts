import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { CampoCelularComponent } from '../../../componentes/campo-celular/campo-celular.component';
import { RegistroService } from '../../../servicios/registro.service';
import { ApiService } from '../../../core/api.service';

/** Registro · Paso 1 de 4: número de celular. */
@Component({
  selector: 'app-registro-celular',
  templateUrl: 'registro-celular.page.html',
  styleUrls: ['registro-celular.page.scss'],
  imports: [IonContent, HeroCieloComponent, CampoCelularComponent],
})
export class RegistroCelularPage {
  private readonly router = inject(Router);
  private readonly registro = inject(RegistroService);

  readonly digitos = signal(this.registro.celular());
  readonly intentoEnviar = signal(false);
  readonly enviando = signal(false);
  /** Error que devolvió el backend (número ya registrado, demasiados códigos, sin conexión...). */
  readonly errorServidor = signal('');

  readonly valido = computed(() => /^3\d{9}$/.test(this.digitos()));
  readonly error = computed(() => {
    if (!this.intentoEnviar()) return '';
    const d = this.digitos();
    if (d.length === 0) return 'Escribe tu número de celular.';
    if (!d.startsWith('3')) return 'Los celulares en Colombia empiezan por 3.';
    if (d.length < 10) return `Faltan ${10 - d.length} dígitos.`;
    return this.errorServidor();
  });

  cambiarDigitos(d: string): void {
    this.digitos.set(d);
    this.errorServidor.set('');
  }

  async enviarCodigo(): Promise<void> {
    this.intentoEnviar.set(true);
    if (!this.valido() || this.enviando()) return;

    this.enviando.set(true);
    this.errorServidor.set('');
    try {
      await this.registro.enviarCodigo(this.digitos());
      this.router.navigateByUrl('/registro/codigo');
    } catch (err) {
      this.errorServidor.set(ApiService.mensaje(err, 'No pudimos enviar el código. Intenta de nuevo.'));
    } finally {
      this.enviando.set(false);
    }
  }

  irALogin(): void {
    this.router.navigateByUrl('/login');
  }
}
