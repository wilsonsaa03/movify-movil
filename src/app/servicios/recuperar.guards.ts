import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RecuperarService } from './recuperar.service';

/** Evita saltarse pasos de "Recuperar clave": si falta lo anterior, vuelve al paso 1. */
const exigir =
  (cumple: (r: RecuperarService) => boolean): CanActivateFn =>
  () => {
    const r = inject(RecuperarService);
    return cumple(r) ? true : inject(Router).createUrlTree(['/login/recuperar']);
  };

export const recuperarConCelular = exigir((r) => r.celular().length === 10);
export const recuperarCodigoVerificado = exigir((r) => r.codigoVerificado());
export const recuperarClaveCambiada = exigir((r) => r.claveCambiada());
