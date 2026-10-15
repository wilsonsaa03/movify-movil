import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Rol, SesionService } from './sesion.service';

/**
 * Pantallas solo para ciertos roles.
 * Uso: { path: 'cliente', canActivate: [rolGuard], data: { roles: ['cliente'] } }
 *  - Sin sesión (o vencida y sin refresh token) → /login
 *  - Con otro rol → a su propia pantalla de inicio
 * Es solo navegación: la seguridad real la aplica el backend con el JWT en cada endpoint.
 */
export const rolGuard: CanActivateFn = (route) => {
  const sesion = inject(SesionService);
  const router = inject(Router);
  if (!sesion.activa()) {
    sesion.cerrar();
    return router.createUrlTree(['/login']);
  }
  const roles = (route.data?.['roles'] as Rol[] | undefined) ?? [];
  return roles.length === 0 || sesion.tieneRol(...roles) ? true : router.createUrlTree([sesion.rutaInicio()]);
};

/** Bienvenida, login y registro: si ya hay sesión, va directo a su inicio (no le vuelve a pedir la clave). */
export const invitadoGuard: CanActivateFn = () => {
  const sesion = inject(SesionService);
  return sesion.activa() ? inject(Router).createUrlTree([sesion.rutaInicio()]) : true;
};
