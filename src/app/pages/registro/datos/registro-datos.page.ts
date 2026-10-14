import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { HeroCieloComponent } from '../../../componentes/hero-cielo/hero-cielo.component';
import { RegistroService } from '../../../servicios/registro.service';

const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,40}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Registro · Paso 3 de 4: foto (opcional), nombre, apellido y correo electrónico (opcional). */
@Component({
  selector: 'app-registro-datos',
  templateUrl: 'registro-datos.page.html',
  styleUrls: ['registro-datos.page.scss'],
  imports: [IonContent, HeroCieloComponent],
})
export class RegistroDatosPage {
  private readonly router = inject(Router);
  readonly registro = inject(RegistroService);

  private readonly previos = this.registro.datos();
  readonly nombre = signal(this.previos?.nombre ?? '');
  readonly apellido = signal(this.previos?.apellido ?? '');
  readonly correo = signal(this.previos?.correo ?? '');
  readonly foto = signal<string | null>(this.previos?.foto ?? null);
  readonly acepta = signal(this.previos !== null);

  readonly intento = signal(false);

  readonly esConductor = computed(() => this.registro.rol() === 'conductor');

  readonly errores = computed(() => {
    const e: Record<string, string> = {};
    if (!SOLO_LETRAS.test(this.nombre().trim())) e['nombre'] = 'Escribe tu nombre (solo letras).';
    if (!SOLO_LETRAS.test(this.apellido().trim())) e['apellido'] = 'Escribe tu apellido (solo letras).';
    if (this.correo().trim() && !CORREO.test(this.correo().trim())) e['correo'] = 'Ese correo no parece válido.';
    if (!this.acepta()) e['acepta'] = 'Debes aceptar los Términos y la Política de privacidad.';
    return e;
  });

  /** Solo muestra los errores después de tocar "Continuar". */
  error(campo: string): string {
    return this.intento() ? (this.errores()[campo] ?? '') : '';
  }

  texto(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  elegirFoto(e: Event): void {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    if (!archivo || !archivo.type.startsWith('image/')) return;

    // Se reduce la foto a 400 px para que no pese varios MB
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const lado = 400;
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      this.foto.set(canvas.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  continuar(): void {
    this.intento.set(true);
    if (Object.keys(this.errores()).length > 0) {
      // Lleva al primer campo con error
      const primero = Object.keys(this.errores())[0];
      document.getElementById(`dato-${primero}`)?.focus();
      return;
    }
    this.registro.guardarDatos({
      nombre: capitalizar(this.nombre()),
      apellido: capitalizar(this.apellido()),
      correo: this.correo().trim().toLowerCase(),
      foto: this.foto(),
    });
    this.router.navigateByUrl('/registro/clave');
  }

  ver(ruta: string): void {
    this.router.navigateByUrl(ruta);
  }
}

/** "aNA maría" → "Ana María" */
function capitalizar(t: string): string {
  return t
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\S/g, (l) => l.toUpperCase());
}
