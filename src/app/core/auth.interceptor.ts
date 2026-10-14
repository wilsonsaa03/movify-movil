import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { SesionService } from './sesion.service';

/** Agrega el JWT y la plataforma (android/ios/web) a cada llamada al backend de MoviFY. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);
  const token = inject(SesionService).token;
  const ua = navigator.userAgent.toLowerCase();
  const plataforma = ua.includes('android') ? 'android' : /iphone|ipad/.test(ua) ? 'ios' : 'web';
  return next(
    req.clone({
      setHeaders: token ? { Authorization: `Bearer ${token}`, 'X-Plataforma': plataforma } : { 'X-Plataforma': plataforma },
    }),
  );
};
