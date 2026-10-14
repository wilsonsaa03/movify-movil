import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RegistroService } from './registro.service';

/**
 * Evita saltarse pasos del registro (por ejemplo, si recargan la página en el paso 3
 * y ya no están los datos de los pasos anteriores): los devuelve al inicio del registro.
 */
const exigir =
  (cumple: (r: RegistroService) => boolean): CanActivateFn =>
  () => {
    const registro = inject(RegistroService);
    return cumple(registro) ? true : inject(Router).createUrlTree(['/registro']);
  };

export const conRol = exigir((r) => r.rol() !== null);
export const conCelular = exigir((r) => r.celular().length === 10);
export const celularVerificado = exigir((r) => r.celularVerificado());
export const conDatos = exigir((r) => r.datos() !== null);
export const cuentaCreada = exigir((r) => r.cuentaCreada());
