import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';
import { SesionService } from './sesion.service';

/**
 * Peticiones al backend: agrega "Authorization: Bearer <jwt>" si hay sesión y
 * "X-Plataforma" (android | ios | web), que el backend guarda en las bitácoras.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const token = inject(SesionService).token;
  const headers: Record<string, string> = { 'X-Plataforma': Capacitor.getPlatform() };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return next(req.clone({ setHeaders: headers }));
};
