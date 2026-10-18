import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewEncapsulation, effect, inject, input } from '@angular/core';
import * as L from 'leaflet';

export interface PuntoMapa {
  lat: number;
  lng: number;
}

export interface ZonaDemanda extends PuntoMapa {
  pedidos: number;
}

/** Centro de Buenaventura: el mismo con el que abre el mapa de la web (home-conductor). */
export const BUENAVENTURA: PuntoMapa = { lat: 3.8821, lng: -77.0253 };

/** Mismos mosaicos que usa el frontend web (OpenStreetMap). */
const MOSAICOS = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUCION = '© OpenStreetMap contributors';

const SVG_MOTO =
  '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M5.5 16.5l4-6h5l4 6M14.5 10.5l-1.5-4h3"/>';
const SVG_TAXI =
  '<path d="M5 17h14v-4l-2-5H7l-2 5v4zM9 5h6v3M5 13h14"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/>';

/**
 * Mapa real con Leaflet + OpenStreetMap (el mismo motor y mosaicos del frontend web).
 * Llena su contenedor; el que lo usa decide la altura.
 *
 *   <app-mapa-ciudad marcador="usuario" [centro]="miPosicion" />
 *   <app-mapa-ciudad marcador="moto" [centro]="gps" [zonas]="zonasConMasPedidos" />
 *
 * Sin `centro` muestra Buenaventura sin marcador (mientras llega el GPS).
 */
@Component({
  selector: 'app-mapa-ciudad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Los marcadores los crea Leaflet fuera de la plantilla: sus estilos tienen que ser globales (prefijo mv-mapa)
  encapsulation: ViewEncapsulation.None,
  template: `<div class="mv-mapa"></div>`,
  styles: `
    app-mapa-ciudad { position: relative; display: block; overflow: hidden; background: #f2efe9; }
    /* Leaflet le pone position: relative al contenedor al crearlo: el alto tiene que ser explícito */
    app-mapa-ciudad .mv-mapa { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; background: #f2efe9; font-family: 'Nunito', system-ui, sans-serif; }
    app-mapa-ciudad .leaflet-control-attribution { font-size: 9px; background: rgba(255, 255, 255, 0.75); }

    .mv-mapa-usuario { position: relative; width: 64px; height: 64px; display: grid; place-items: center; }
    .mv-mapa-usuario .halo {
      position: absolute; inset: 0; border-radius: 50%; background: rgba(2, 170, 180, 0.22);
      animation: mv-mapa-halo 2.4s ease-out infinite;
    }
    .mv-mapa-usuario .punto {
      position: relative; width: 22px; height: 22px; border-radius: 50%;
      background: #02aab4; border: 4px solid #ffffff; box-shadow: 0 3px 8px rgba(3, 39, 77, 0.35);
    }
    .mv-mapa-vehiculo {
      width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; box-sizing: border-box;
      background: #fe7b13; border: 3px solid #ffffff; box-shadow: 0 6px 14px rgba(3, 39, 77, 0.35);
    }
    .mv-mapa-vehiculo svg {
      width: 24px; height: 24px; fill: none; stroke: #03274d; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;
    }
    @keyframes mv-mapa-halo { 0% { transform: scale(0.6); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .mv-mapa-usuario .halo { animation: none; } }
  `,
})
export class MapaCiudadComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Qué se dibuja en `centro`: el cliente (punto azul) o el vehículo del conductor. */
  readonly marcador = input<'usuario' | 'moto' | 'taxi' | null>('usuario');
  /** Posición del GPS. null = todavía no se sabe. */
  readonly centro = input<PuntoMapa | null>(null);
  /** Zonas con más pedidos (app del conductor). */
  readonly zonas = input<ZonaDemanda[]>([]);
  readonly zoom = input(16);
  /** Radio de error del GPS en metros: se dibuja un círculo suave alrededor del punto. */
  readonly precision = input<number | null>(null);

  private mapa?: L.Map;
  private punto?: L.Marker;
  private aro?: L.Circle;
  private capaZonas?: L.LayerGroup;
  private observador?: ResizeObserver;
  private centrado = false;

  constructor() {
    // Cada vez que cambian las entradas se actualiza el mapa (si ya existe)
    effect(() => this.pintarMarcador(this.centro(), this.marcador()));
    effect(() => this.pintarPrecision(this.centro(), this.precision()));
    effect(() => this.pintarZonas(this.zonas()));
  }

  ngAfterViewInit(): void {
    const div = this.host.nativeElement.querySelector<HTMLElement>('.mv-mapa')!;
    this.mapa = L.map(div, {
      center: [BUENAVENTURA.lat, BUENAVENTURA.lng],
      zoom: 14,
      zoomControl: false,
      scrollWheelZoom: false,
      // En el celular un dedo desplaza la página; el mapa se mueve con dos dedos (o arrastrando en el PC)
      dragging: !L.Browser.mobile,
      tap: false,
    } as L.MapOptions);
    L.tileLayer(MOSAICOS, { attribution: ATRIBUCION, maxZoom: 19 }).addTo(this.mapa);
    this.capaZonas = L.layerGroup().addTo(this.mapa);

    // Ionic anima la entrada de la página: Leaflet necesita recalcular el tamaño cuando el contenedor cambia
    this.observador = new ResizeObserver(() => this.mapa?.invalidateSize());
    this.observador.observe(div);

    this.pintarPrecision(this.centro(), this.precision());
    this.pintarMarcador(this.centro(), this.marcador());
    this.pintarZonas(this.zonas());
  }

  /** Vuelve a centrar el mapa en el punto (botón "mi ubicación"). */
  recentrar(): void {
    const c = this.centro();
    if (this.mapa && c) this.mapa.flyTo([c.lat, c.lng], this.zoom(), { duration: 0.6 });
  }

  private pintarPrecision(c: PuntoMapa | null, metros: number | null): void {
    if (!this.mapa) return;
    // Por debajo de 25 m el halo del punto ya lo representa; sin dato no se dibuja
    if (!c || !metros || metros < 25) {
      this.aro?.remove();
      this.aro = undefined;
      return;
    }
    if (this.aro) {
      this.aro.setLatLng([c.lat, c.lng]).setRadius(metros);
    } else {
      this.aro = L.circle([c.lat, c.lng], {
        radius: metros,
        color: '#02aab4',
        weight: 1.5,
        opacity: 0.5,
        fillColor: '#02aab4',
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(this.mapa);
    }
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
    this.mapa?.remove();
    this.mapa = undefined;
  }

  private pintarMarcador(c: PuntoMapa | null, tipo: 'usuario' | 'moto' | 'taxi' | null): void {
    if (!this.mapa) return;
    if (!c || !tipo) {
      this.punto?.remove();
      this.punto = undefined;
      return;
    }
    const icono = tipo === 'usuario' ? this.iconoUsuario() : this.iconoVehiculo(tipo);
    if (this.punto) {
      this.punto.setLatLng([c.lat, c.lng]).setIcon(icono);
    } else {
      this.punto = L.marker([c.lat, c.lng], { icon: icono, keyboard: false, interactive: false }).addTo(this.mapa);
    }
    // La primera vez salta directo; después se desliza suave para seguir al usuario
    if (this.centrado) this.mapa.panTo([c.lat, c.lng]);
    else this.mapa.setView([c.lat, c.lng], this.zoom());
    this.centrado = true;
  }

  private pintarZonas(zonas: ZonaDemanda[]): void {
    if (!this.capaZonas) return;
    this.capaZonas.clearLayers();
    const max = Math.max(1, ...zonas.map((z) => z.pedidos));
    for (const z of zonas) {
      const peso = z.pedidos / max; // la zona con más pedidos es la más grande y la más intensa
      L.circle([z.lat, z.lng], {
        radius: 160 + peso * 260,
        color: '#fe7b13',
        weight: 2,
        opacity: 0.45,
        fillColor: '#fe7b13',
        fillOpacity: 0.12 + peso * 0.16,
        interactive: false,
      }).addTo(this.capaZonas);
      L.circleMarker([z.lat, z.lng], {
        radius: 7,
        color: '#e2477a',
        weight: 3,
        fillColor: '#ffffff',
        fillOpacity: 1,
        interactive: false,
      }).addTo(this.capaZonas);
    }
  }

  private iconoUsuario(): L.DivIcon {
    return L.divIcon({
      className: '',
      html: '<span class="mv-mapa-usuario"><span class="halo"></span><span class="punto"></span></span>',
      iconSize: [64, 64],
      iconAnchor: [32, 32],
    });
  }

  private iconoVehiculo(tipo: 'moto' | 'taxi'): L.DivIcon {
    return L.divIcon({
      className: '',
      html: `<span class="mv-mapa-vehiculo"><svg viewBox="0 0 24 24" aria-hidden="true">${tipo === 'taxi' ? SVG_TAXI : SVG_MOTO}</svg></span>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }
}
