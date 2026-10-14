import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SesionService } from '../core/sesion.service';
import { ConductorRegistroService, RUTA_PASO } from './conductor-registro.service';

/** Sin sesión no hay registro de conductor: lo manda a iniciar sesión. */
export const conSesion: CanActivateFn = () =>
  inject(SesionService).activa() ? true : inject(Router).createUrlTree(['/login']);

/**
 * Entrada única "/conductor": pregunta al backend en qué paso va y abre esa pantalla.
 * Así, si cierra la app a mitad del registro, al volver sigue donde quedó.
 */
export const irAlPaso: CanActivateFn = async () => {
  const router = inject(Router);
  const registro = inject(ConductorRegistroService);
  if (!inject(SesionService).activa()) return router.createUrlTree(['/login']);
  try {
    const p = await registro.cargar();
    if (p.siguiente === 'identidad' && !p.tiene_perfil && !registro.tipoElegido()) return router.createUrlTree(['/conductor/tipo']);
    return router.createUrlTree([RUTA_PASO[p.siguiente]]);
  } catch {
    // Sin conexión: que al menos pueda empezar por el principio
    return router.createUrlTree(['/conductor/tipo']);
  }
};
