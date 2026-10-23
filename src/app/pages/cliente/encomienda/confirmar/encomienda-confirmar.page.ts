import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { IonContent, IonFooter, NavController, ViewDidEnter } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ApiService, ErrorApi } from '../../../../core/api.service';
import { pesos } from '../../../../core/formato';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { LugaresService } from '../../../../servicios/lugares.service';
import { EncomiendaService, nombrePaquete } from '../../../../servicios/encomienda.service';

/**
 * Encomienda 3 · Confirma tu envío.
 * Ruta real (OSRM) con "15 min · 5,1 km", precio fijo del backend (/api/tarifas/cotizar, tarifa de encomienda),
 * quién paga (siempre en efectivo). "Enviar paquete" crea el servicio → Buscando (la misma de Viaje 4).
 */
@Component({
  selector: 'app-encomienda-confirmar',
  templateUrl: 'encomienda-confirmar.page.html',
  styleUrls: ['encomienda-confirmar.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent],
})
export class EncomiendaConfirmarPage implements ViewDidEnter, AfterViewInit, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly api = inject(ApiService);
  private readonly lugares = inject(LugaresService);
  readonly envio = inject(EncomiendaService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;

  readonly cargando = signal(true);
  readonly enviando = signal(false);
  readonly error = signal('');
  readonly ruta = signal<PuntoMapa[]>([]);
  readonly etiqueta = signal<string | null>(null);
  readonly altoHoja = signal(0);
  readonly pesos = pesos;

  readonly origen = computed<PuntoMapa | null>(() => this.envio.origen());
  readonly destino = computed(() => {
    const d = this.envio.destino();
    return d ? { lat: d.lat, lng: d.lng, nombre: d.barrio ?? d.nombre } : null;
  });
  readonly titulo = computed(() => nombrePaquete(this.envio.tamano() === 'mediano' ? 'mediano' : 'pequeno', this.envio.fragil()));
  readonly paraQuien = computed(() => (this.envio.recibeYo() ? 'Lo recibes tú' : `Para ${this.envio.nombreRecibe().trim()}`));

  ngAfterViewInit(): void {
    this.medidor = new ResizeObserver(() => this.altoHoja.set(this.hojaRef().nativeElement.offsetHeight));
    this.medidor.observe(this.hojaRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.medidor?.disconnect();
  }

  ionViewDidEnter(): void {
    if (!this.envio.origen() || !this.envio.destino() || !this.envio.contenido().trim()) {
      this.nav.navigateRoot('/cliente/encomienda', { animationDirection: 'back' });
      return;
    }
    // "Lo recibo yo mismo": no hay a quién cobrarle al recibir
    if (this.envio.recibeYo()) this.envio.pagaDestinatario.set(false);
    this.cargar();
  }

  volver(): void {
    this.nav.back();
  }

  elegirPagador(destinatario: boolean): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.envio.pagaDestinatario.set(destinatario);
  }

  async enviar(): Promise<void> {
    if (this.enviando() || !this.envio.precio()) return;
    this.enviando.set(true);
    this.error.set('');
    try {
      const s = await this.envio.pedir();
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
      this.envio.olvidar();
      // Raíz: desde "Buscando" el botón atrás no vuelve aquí (la encomienda ya existe)
      this.nav.navigateRoot('/cliente/viaje/buscando', { queryParams: { id: s.id } });
    } catch (e) {
      const err = e as ErrorApi;
      if (err.status === 409) {
        // Ya tiene un servicio andando: se lleva a ese en vez de crear otro
        const activo = await this.api.get<{ id: number; estado_codigo: string } | null>('/servicios/activo').catch(() => null);
        if (activo?.id) {
          this.nav.navigateRoot(activo.estado_codigo === 'buscando' ? '/cliente/viaje/buscando' : '/cliente/encomienda/seguimiento', {
            queryParams: { id: activo.id },
          });
          return;
        }
      }
      this.error.set(err.message || 'No pudimos enviar tu paquete. Intenta de nuevo.');
    } finally {
      this.enviando.set(false);
    }
  }

  async reintentar(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    // La ruta es un "extra" (no frena el precio)
    this.lugares.ruta(this.envio.origen()!, this.envio.destino()!).then((r) => this.ruta.set(r.puntos));
    try {
      const c = await this.envio.cotizar();
      this.etiqueta.set(`${c.min} min · ${c.km.toFixed(1).replace('.', ',')} km`);
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos calcular el precio.');
    } finally {
      this.cargando.set(false);
    }
  }
}
