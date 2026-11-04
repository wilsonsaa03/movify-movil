import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ApiService } from './api.service';

export type EstadoVersion = 'al-dia' | 'sugerida' | 'obligatoria';

/** "1.10.0" > "1.9.3": compara número por número (no como texto). */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function estadoVersion(instalada: string, minima: string, ultima: string): EstadoVersion {
  if (compararVersiones(instalada, minima) < 0) return 'obligatoria';
  if (compararVersiones(instalada, ultima) < 0) return 'sugerida';
  return 'al-dia';
}

/**
 * ¿La app instalada sigue siendo compatible? GET /api/catalogos/app-version (público, V20).
 * Menor que la mínima → pantalla "Actualiza MoviFY" que no deja seguir; menor que la última → solo sugerencia.
 * Solo en la app instalada: en el navegador siempre se carga la última versión.
 */
@Injectable({ providedIn: 'root' })
export class VersionAppService {
  private readonly api = inject(ApiService);

  readonly estado = signal<EstadoVersion>('al-dia');
  readonly urlTienda = signal('https://play.google.com/store/apps/details?id=co.movify.app');
  readonly instalada = signal('');

  async revisar(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const [info, r] = await Promise.all([
        App.getInfo(),
        this.api.get<{ minima: string; ultima: string; url_android: string }>('/catalogos/app-version'),
      ]);
      this.instalada.set(info.version);
      if (r.url_android) this.urlTienda.set(r.url_android);
      this.estado.set(estadoVersion(info.version, r.minima, r.ultima));
    } catch {
      // Sin internet o backend viejo: no se bloquea a nadie por no poder revisar
    }
  }

  abrirTienda(): void {
    window.open(this.urlTienda(), '_system');
  }
}
