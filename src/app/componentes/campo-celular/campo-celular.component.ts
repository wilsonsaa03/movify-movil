import { Component, computed, input, model } from '@angular/core';

/**
 * Campo de celular colombiano: bandera, +57 y el número con espacios (300 123 4567).
 * Se usa en Iniciar sesión y en el Paso 1 del registro.
 *
 *   <app-campo-celular [(digitos)]="celular" [error]="hayError" [listo]="esValido" />
 */
@Component({
  selector: 'app-campo-celular',
  template: `
    <div class="campo" [class.con-error]="error()" [class.listo]="listo()">
      <span class="prefijo" aria-hidden="true">
        <svg class="bandera" viewBox="0 0 26 18">
          <rect width="26" height="9" fill="#FCD116" />
          <rect y="9" width="26" height="4.5" fill="#003893" />
          <rect y="13.5" width="26" height="4.5" fill="#CE1126" />
        </svg>
        +57
      </span>
      <span class="separador" aria-hidden="true"></span>
      <input
        id="celular"
        type="tel"
        inputmode="numeric"
        autocomplete="tel-national"
        placeholder="300 123 4567"
        maxlength="12"
        [attr.aria-invalid]="error()"
        aria-describedby="ayuda-celular"
        [value]="conFormato()"
        (input)="alEscribir($event)"
      />
      <svg class="ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </div>
  `,
  styleUrl: 'campo-celular.component.scss',
})
export class CampoCelularComponent {
  /** Solo los dígitos, sin espacios. Ej: "3001234567" */
  readonly digitos = model('');
  readonly error = input(false);
  readonly listo = input(false);

  /** "3001234567" → "300 123 4567" */
  readonly conFormato = computed(() => {
    const d = this.digitos();
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
  });

  alEscribir(e: Event): void {
    const campo = e.target as HTMLInputElement;
    // Cuántos dígitos hay antes del cursor (para dejarlo en el mismo sitio después de formatear)
    const cursor = campo.selectionStart ?? campo.value.length;
    let digitosAntes = campo.value.slice(0, cursor).replace(/\D/g, '').length;

    // Acepta pegar "+57 300 123 4567": quita todo lo que no sea número y el indicativo
    let d = campo.value.replace(/\D/g, '');
    if (d.length > 10 && d.startsWith('57')) {
      d = d.slice(2);
      digitosAntes = Math.max(digitosAntes - 2, 0);
    }
    this.digitos.set(d.slice(0, 10));

    // El campo siempre muestra el número con espacios
    const texto = this.conFormato();
    campo.value = texto;
    let pos = 0;
    for (let vistos = 0; pos < texto.length && vistos < digitosAntes; pos++) {
      if (/\d/.test(texto[pos])) vistos++;
    }
    campo.setSelectionRange(pos, pos);
  }
}
