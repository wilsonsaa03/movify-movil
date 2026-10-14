import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { CampoCelularComponent } from '../../../componentes/campo-celular/campo-celular.component';
import { RegistroService } from '../../../servicios/registro.service';
import { ErrorApi } from '../../../core/api.service';

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
  /** Mensaje que manda el backend (p. ej. "Ya existe una cuenta con ese celular"). */
  readonly errorServidor = signal('');
  /** true cuando el número ya tiene cuenta: se ofrece ir a iniciar sesión. */
  readonly yaRegistrado = signal(false);

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

  async enviarCodigo(): Promise<void> {
    this.intentoEnviar.set(true);
    if (!this.valido() || this.enviando()) return;

    this.enviando.set(true);
    this.errorServidor.set('');
    this.yaRegistrado.set(false);
    try {
      await this.registro.enviarCodigo(this.digitos());
      this.router.navigateByUrl('/registro/codigo');
    } catch (e) {
      const err = e as ErrorApi;
      this.errorServidor.set(err.message);
      this.yaRegistrado.set(err.message.includes('Ya existe'));
    } finally {
      this.enviando.set(false);
    }
  }

  /** Al editar el número se borra el error del backend. */
  cambio(d: string): void {
    this.digitos.set(d);
    this.errorServidor.set('');
    this.yaRegistrado.set(false);
  }

  irALogin(): void {
    this.router.navigate(['/login'], { queryParams: this.yaRegistrado() ? { celular: this.digitos() } : {} });
  }
}
