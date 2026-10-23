import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewEncapsulation, effect, inject, input, output, untracked } from '@angular/core';
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
    /* Destino: pin azul oscuro con el nombre al lado (como en el Figma) */
    .mv-mapa-destino { position: relative; width: 36px; height: 44px; }
    .mv-mapa-destino .pin {
      position: absolute; left: 0; bottom: 0; width: 36px; height: 40px; border-radius: 18px 18px 6px 6px;
      background: #03274d; display: grid; place-items: center; box-shadow: 0 6px 12px rgba(3, 39, 77, 0.3);
    }
    .mv-mapa-destino .pin::after { content: ''; width: 12px; height: 12px; border-radius: 3px; background: #ffffff; }
    .mv-mapa-destino .nombre {
      position: absolute; right: 44px; top: 6px; max-width: 170px; padding: 6px 12px; border-radius: 12px;
      background: #ffffff; box-shadow: 0 4px 12px rgba(3, 39, 77, 0.18);
      font: 800 13px 'Nunito', system-ui, sans-serif; color: #03274d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    /* Etiqueta en la mitad de la ruta: "12 min · 4,2 km" */
    .mv-mapa-etiqueta {
      display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 14px; white-space: nowrap;
      transform: translate(-50%, -50%); background: #03274d; color: #ffffff; box-shadow: 0 6px 14px rgba(3, 39, 77, 0.3);
      font: 800 14px 'Nunito', system-ui, sans-serif;
    }
    .mv-mapa-etiqueta svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
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
  /** Píxeles de abajo que tapa algo encima del mapa (la hoja de servicios): el punto se centra en lo que sí se ve. */
  readonly margenInferior = input(0);
  /** Ruta a dibujar (línea naranja con borde azul). */
  readonly ruta = input<PuntoMapa[]>([]);
  /** Destino: pin oscuro y su nombre al lado. */
  readonly destino = input<(PuntoMapa & { nombre?: string }) | null>(null);
  /** Texto en la mitad de la ruta, p. ej. "12 min · 4,2 km". */
  readonly etiquetaRuta = input<string | null>(null);
  /** true = encuadra el punto, la ruta y el destino (en vez de seguir el punto). */
  readonly encuadrar = input(false);
  /** true = se mueve con un dedo (pantallas donde el mapa es lo principal, como elegir un punto). */
  readonly arrastrable = input(false);
  /** Punto que tocó el usuario en el mapa. */
  readonly toque = output<PuntoMapa>();

  private mapa?: L.Map;
  private punto?: L.Marker;
  private aro?: L.Circle;
  private capaRuta?: L.LayerGroup;
  private capaZonas?: L.LayerGroup;
  private observador?: ResizeObserver;
  private centrado = false;

  constructor() {
    // Cada vez que cambian las entradas se actualiza el mapa (si ya existe)
    effect(() => this.pintarMarcador(this.centro(), this.marcador()));
    effect(() => this.pintarPrecision(this.centro(), this.precision()));
    effect(() => this.pintarZonas(this.zonas()));
    effect(() => this.pintarRuta(this.ruta(), this.destino(), this.etiquetaRuta()));
    // Si la hoja sube o baja, el punto se desliza al centro de la parte visible
    effect(() => {
      this.margenInferior();
      if (untracked(this.encuadrar)) {
        this.encuadre();
        return;
      }
      const c = untracked(this.centro);
      if (this.centrado && this.mapa && c) {
        const z = this.mapa.getZoom(); // respeta el zoom que haya puesto el usuario
        this.mapa.flyTo(this.vista(c, z), z, { duration: 0.4 });
      }
    });
  }

  ngAfterViewInit(): void {
    const div = this.host.nativeElement.querySelector<HTMLElement>('.mv-mapa')!;
    this.mapa = L.map(div, {
      center: [BUENAVENTURA.lat, BUENAVENTURA.lng],
      zoom: 14,
      zoomControl: false,
      scrollWheelZoom: false,
      // En el celular un dedo desplaza la página; el mapa se mueve con dos dedos (o arrastrando en el PC)
      dragging: this.arrastrable() || !L.Browser.mobile,
      tap: false,
    } as L.MapOptions);
    L.tileLayer(MOSAICOS, { attribution: ATRIBUCION, maxZoom: 19 }).addTo(this.mapa);
    this.mapa.on('click', (e: L.LeafletMouseEvent) => this.toque.emit({ lat: e.latlng.lat, lng: e.latlng.lng }));
    this.capaZonas = L.layerGroup().addTo(this.mapa);
    this.capaRuta = L.layerGroup().addTo(this.mapa);

    // Ionic anima la entrada de la página: Leaflet necesita recalcular el tamaño cuando el contenedor cambia
    this.observador = new ResizeObserver(() => this.mapa?.invalidateSize());
    this.observador.observe(div);

    this.pintarPrecision(this.centro(), this.precision());
    this.pintarMarcador(this.centro(), this.marcador());
    this.pintarZonas(this.zonas());
    this.pintarRuta(this.ruta(), this.destino(), this.etiquetaRuta());
  }

  /** Vuelve a centrar el mapa en el punto (botón "mi ubicación"). */
  recentrar(): void {
    const c = this.centro();
    if (this.mapa && c) this.mapa.flyTo(this.vista(c, this.zoom()), this.zoom(), { duration: 0.6 });
  }

  /** Centro que deja el punto en la mitad de la parte visible (sin contar lo que tapa la hoja). */
  private vista(c: PuntoMapa, zoom: number): L.LatLng {
    const punto = L.latLng(c.lat, c.lng);
    const margen = this.margenInferior();
    if (!this.mapa || margen <= 0) return punto;
    const alto = this.mapa.getSize().y;
    const corrimiento = Math.min(margen, alto - 60) / 2; // siempre deja al menos 60 px de mapa
    return this.mapa.unproject(this.mapa.project(punto, zoom).add([0, corrimiento]), zoom);
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
    if (this.encuadrar()) {
      this.encuadre();
      this.centrado = true;
      return;
    }
    // La primera vez salta directo; después se desliza suave para seguir al usuario
    if (this.centrado) this.mapa.panTo(this.vista(c, this.mapa.getZoom()));
    else this.mapa.setView(this.vista(c, this.zoom()), this.zoom());
    this.centrado = true;
  }

  private pintarRuta(ruta: PuntoMapa[], destino: (PuntoMapa & { nombre?: string }) | null, etiqueta: string | null): void {
    if (!this.capaRuta) return;
    this.capaRuta.clearLayers();
    if (ruta.length > 1) {
      const linea = ruta.map((p) => L.latLng(p.lat, p.lng));
      // Borde azul + línea naranja encima (como en el Figma)
      L.polyline(linea, { color: '#03274d', weight: 9, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.capaRuta);
      L.polyline(linea, { color: '#fe7b13', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.capaRuta);
      if (etiqueta) {
        const medio = linea[Math.floor(linea.length / 2)];
        L.marker(medio, {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: '',
            iconSize: [0, 0],
            html: `<span class="mv-mapa-etiqueta"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>${escapar(etiqueta)}</span>`,
          }),
        }).addTo(this.capaRuta);
      }
    }
    if (destino) {
      const nombre = destino.nombre ? `<span class="nombre">${escapar(destino.nombre)}</span>` : '';
      L.marker([destino.lat, destino.lng], {
        interactive: false,
        keyboard: false,
        zIndexOffset: 500,
        icon: L.divIcon({ className: '', html: `<span class="mv-mapa-destino"><span class="pin"></span>${nombre}</span>`, iconSize: [36, 44], iconAnchor: [18, 44] }),
      }).addTo(this.capaRuta);
    }
    if (this.encuadrar()) this.encuadre();
  }

  /** Muestra el punto, la ruta y el destino completos, dejando libre lo que tapa la hoja de abajo. */
  private encuadre(): void {
    if (!this.mapa) return;
    const puntos: L.LatLngExpression[] = this.ruta().map((p) => [p.lat, p.lng] as [number, number]);
    const c = this.centro();
    const d = this.destino();
    if (c) puntos.push([c.lat, c.lng]);
    if (d) puntos.push([d.lat, d.lng]);
    if (!puntos.length) return;
    const alto = this.mapa.getSize().y;
    const abajo = Math.min(this.margenInferior() + 40, Math.max(60, alto - 160));
    this.mapa.fitBounds(L.latLngBounds(puntos), { paddingTopLeft: [60, 110], paddingBottomRight: [60, abajo], maxZoom: 17 });
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

/** Los nombres vienen de OpenStreetMap o del usuario: se escapan antes de meterlos en el HTML del marcador. */
function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
