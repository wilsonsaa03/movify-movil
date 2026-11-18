import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewEncapsulation, effect, inject, input, output, untracked } from '@angular/core';
import * as L from 'leaflet';
import { Punto, caminoPorRuta, largo, metros, puntoEn } from './animar-por-ruta';
import type { RecorridoSimulado } from '../../servicios/simulacion-viaje.service';

export interface PuntoMapa {
  lat: number;
  lng: number;
}

export interface ZonaDemanda extends PuntoMapa {
  pedidos: number;
}

/** Lo más que tarda el vehículo en ir de una posición a la siguiente (al pasajero le llegan cada 6-8 s). */
const DURACION_MS = 5500;
/** Más lejos que esto no se anima (se perdió la señal un rato): se pone directo en la posición nueva. */
const SALTO_MAXIMO_M = 1500;
/** Viaje simulado: cada cuánto se repinta el tramo recorrido y se revisa si la cámara debe seguir al vehículo. */
const LINEA_MS = 250;
const SEGUIR_MS = 900;

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
    /* Vehículo con flecha de rumbo (viaje simulado): la flecha gira, el ícono queda derecho */
    .mv-mapa-vehiculo-caja { position: relative; display: block; width: 44px; height: 44px; }
    .mv-mapa-rumbo { position: absolute; inset: -11px; display: block; pointer-events: none; will-change: transform; }
    .mv-mapa-rumbo::before {
      content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
      border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 11px solid #03274d;
      filter: drop-shadow(0 1px 1px rgba(255, 255, 255, 0.9));
    }
    .mv-mapa-vehiculo svg {
      width: 24px; height: 24px; fill: none; stroke: #03274d; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;
    }
    /* Conductores libres cerca (antes de pedir): más pequeños y sin borde naranja para no confundirse con el asignado */
    .mv-mapa-libre {
      width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; box-sizing: border-box;
      background: #ffffff; border: 2px solid #03274d; box-shadow: 0 3px 8px rgba(3, 39, 77, 0.25);
      transition: transform 600ms cubic-bezier(0.23, 1, 0.32, 1);
    }
    .mv-mapa-libre.taxi { background: #ffc94d; }
    .mv-mapa-libre svg {
      width: 17px; height: 17px; fill: none; stroke: #03274d; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;
    }
    /* Parada: rombo naranja con borde blanco */
    .mv-mapa-parada {
      display: block; width: 18px; height: 18px; transform: rotate(45deg); border-radius: 4px;
      background: #fe7b13; border: 3px solid #ffffff; box-shadow: 0 3px 8px rgba(3, 39, 77, 0.3);
    }
    /* Destino: pin azul oscuro con el nombre al lado (como en el Figma).
       display: block es obligatorio: un <span> es inline e ignora width/height, la caja quedaba en 0×0
       y el pin se dibujaba 44 px por encima del punto tocado (parecía que marcaba "un aproximado"). */
    .mv-mapa-destino { position: relative; display: block; width: 36px; height: 44px; }
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
  /** Conductores libres cerca (posición aproximada): los "carritos" antes de pedir. */
  readonly vehiculos = input<(PuntoMapa & { tipo_vehiculo: 'moto' | 'taxi' })[]>([]);
  /** Una parada en el camino. */
  readonly parada = input<PuntoMapa | null>(null);
  /**
   * Viaje simulado (SimulacionViajeService): el vehículo avanza cuadro a cuadro sobre la polilínea de la ruta,
   * con su rumbo, el tramo recorrido en gris y la cámara siguiéndolo. Mientras haya simulación se ignoran
   * `centro` y `ruta` para el vehículo (manda la simulación).
   */
  readonly simulacion = input<RecorridoSimulado | null>(null);
  /** Punto que tocó el usuario en el mapa. */
  readonly toque = output<PuntoMapa>();

  private mapa?: L.Map;
  private punto?: L.Marker;
  private aro?: L.Circle;
  private capaRuta?: L.LayerGroup;
  private capaZonas?: L.LayerGroup;
  private capaLibres?: L.LayerGroup;
  private observador?: ResizeObserver;
  private centrado = false;
  /** Animación del vehículo en curso (requestAnimationFrame) y dónde se ve ahora mismo. */
  private animacion: number | null = null;
  private visible: Punto | null = null;
  private ultimaPosicion = 0;
  /** Lo que dura la animación actual: el mapa se desplaza al mismo ritmo que el vehículo. */
  private duracionActual = DURACION_MS;
  /** Viaje simulado: marcador propio, línea gris de lo recorrido y el bucle de animación. */
  private simMarcador?: L.Marker;
  private simRecorrida?: L.Polyline;
  private simBucle: number | null = null;
  private simVersion = -1;
  private simRumbo: number | null = null;
  private simUltimaLinea = 0;
  private simUltimoSeguir = 0;
  private simVisible: Punto | null = null;

  constructor() {
    // Cada vez que cambian las entradas se actualiza el mapa (si ya existe)
    effect(() => this.pintarMarcador(this.centro(), this.marcador()));
    effect(() => this.pintarPrecision(this.centro(), this.precision()));
    effect(() => this.pintarZonas(this.zonas()));
    effect(() => this.pintarRuta(this.simulacion()?.ruta.puntos ?? this.ruta(), this.destino(), this.etiquetaRuta(), this.parada()));
    effect(() => {
      const s = this.simulacion();
      untracked(() => this.cambiarSimulacion(s));
    });
    effect(() => this.pintarLibres(this.vehiculos()));
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
    this.capaLibres = L.layerGroup().addTo(this.mapa);
    this.capaRuta = L.layerGroup().addTo(this.mapa);

    // Ionic anima la entrada de la página: Leaflet necesita recalcular el tamaño cuando el contenedor cambia
    this.observador = new ResizeObserver(() => this.mapa?.invalidateSize());
    this.observador.observe(div);

    this.pintarPrecision(this.centro(), this.precision());
    this.pintarMarcador(this.centro(), this.marcador());
    this.pintarZonas(this.zonas());
    this.pintarLibres(this.vehiculos());
    this.pintarRuta(this.simulacion()?.ruta.puntos ?? this.ruta(), this.destino(), this.etiquetaRuta(), this.parada());
    this.cambiarSimulacion(this.simulacion());
  }

  /** Vuelve a centrar el mapa en el punto (botón "mi ubicación"). */
  recentrar(): void {
    const c = this.simVisible ?? this.centro();
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
    if (this.animacion !== null) cancelAnimationFrame(this.animacion);
    if (this.simBucle !== null) cancelAnimationFrame(this.simBucle);
    this.observador?.disconnect();
    this.mapa?.remove();
    this.mapa = undefined;
  }

  private pintarMarcador(c: PuntoMapa | null, tipo: 'usuario' | 'moto' | 'taxi' | null): void {
    if (!this.mapa) return;
    // Viaje simulado: el vehículo lo mueve el bucle de la simulación (aquí solo se cambia el ícono si hace falta)
    if (untracked(this.simulacion) && tipo !== 'usuario') {
      this.punto?.remove();
      this.punto = undefined;
      this.simMarcador?.setIcon(this.iconoVehiculo(tipo === 'taxi' ? 'taxi' : 'moto', true));
      return;
    }
    if (!c || !tipo) {
      this.punto?.remove();
      this.punto = undefined;
      return;
    }
    const icono = tipo === 'usuario' ? this.iconoUsuario() : this.iconoVehiculo(tipo);
    if (this.punto) {
      this.punto.setIcon(icono);
      // El vehículo no salta: avanza despacio por la ruta hasta la posición nueva
      if (tipo !== 'usuario' && this.visible) this.avanzar(this.visible, c);
      else this.ponerEn(c);
    } else {
      this.punto = L.marker([c.lat, c.lng], { icon: icono, keyboard: false, interactive: false }).addTo(this.mapa);
      this.visible = { lat: c.lat, lng: c.lng };
    }
    if (this.encuadrar()) {
      this.encuadre();
      this.centrado = true;
      return;
    }
    // La primera vez salta directo; después se desliza suave para seguir al usuario (al ritmo del vehículo)
    if (this.centrado) {
      this.mapa.panTo(this.vista(c, this.mapa.getZoom()), tipo === 'usuario' ? undefined : { animate: true, duration: this.duracionActual / 1000 });
    }
    else this.mapa.setView(this.vista(c, this.zoom()), this.zoom());
    this.centrado = true;
  }

  private ponerEn(c: Punto): void {
    if (this.animacion !== null) cancelAnimationFrame(this.animacion);
    this.animacion = null;
    this.punto?.setLatLng([c.lat, c.lng]);
    this.visible = { lat: c.lat, lng: c.lng };
  }

  /**
   * Desliza el vehículo desde donde se ve ahora hasta `hasta`, siguiendo la línea de la ruta (dobla en las
   * esquinas). Dura casi lo que tarda en llegar la próxima posición (cada 6-8 s), así se ve en movimiento
   * continuo y despacio. Saltos enormes (volvió la señal) o "reducir movimiento" → se pone directo.
   */
  private avanzar(desde: Punto, hasta: Punto): void {
    const distancia = metros(desde, hasta);
    const sinAnimar = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (distancia < 1 || distancia > SALTO_MAXIMO_M || sinAnimar) {
      this.ponerEn(hasta);
      return;
    }
    const camino = caminoPorRuta(desde, hasta, untracked(this.ruta));
    const total = largo(camino);
    if (total > SALTO_MAXIMO_M * 1.5) {
      this.ponerEn(hasta); // por la ruta queda demasiado lejos: mejor no dar la vuelta animada
      return;
    }
    if (this.animacion !== null) cancelAnimationFrame(this.animacion);
    // Dura lo que tardó en llegar esta posición: el pasajero recibe una cada 6-8 s (va despacio y continuo);
    // el GPS del propio conductor da una por segundo (sigue su ritmo sin quedarse atrás)
    const inicio = performance.now();
    const duracion = this.ultimaPosicion ? Math.min(DURACION_MS, Math.max(600, (inicio - this.ultimaPosicion) * 0.95)) : DURACION_MS;
    this.ultimaPosicion = inicio;
    this.duracionActual = duracion;
    const paso = (ahora: number) => {
      const f = Math.min(1, (ahora - inicio) / duracion);
      const p = puntoEn(camino, f);
      this.punto?.setLatLng([p.lat, p.lng]);
      this.visible = p;
      this.animacion = f < 1 ? requestAnimationFrame(paso) : null;
    };
    this.animacion = requestAnimationFrame(paso);
  }

  private pintarLibres(libres: (PuntoMapa & { tipo_vehiculo: 'moto' | 'taxi' })[]): void {
    if (!this.capaLibres) return;
    this.capaLibres.clearLayers();
    for (const v of libres) {
      // El tipo llega del servidor y va dentro de HTML: solo se aceptan los dos valores conocidos
      const tipo = v.tipo_vehiculo === 'taxi' ? 'taxi' : 'moto';
      L.marker([v.lat, v.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: '',
          html: `<span class="mv-mapa-libre ${tipo}"><svg viewBox="0 0 24 24" aria-hidden="true">${tipo === 'taxi' ? SVG_TAXI : SVG_MOTO}</svg></span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      }).addTo(this.capaLibres);
    }
  }

  private pintarRuta(
    ruta: PuntoMapa[],
    destino: (PuntoMapa & { nombre?: string }) | null,
    etiqueta: string | null,
    parada: PuntoMapa | null = null,
  ): void {
    if (!this.capaRuta) return;
    this.capaRuta.clearLayers();
    if (parada) {
      L.marker([parada.lat, parada.lng], {
        interactive: false,
        keyboard: false,
        zIndexOffset: 400,
        icon: L.divIcon({ className: '', html: '<span class="mv-mapa-parada"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      }).addTo(this.capaRuta);
    }
    if (ruta.length > 1) {
      const linea = ruta.map((p) => L.latLng(p.lat, p.lng));
      // Borde azul + línea naranja encima (como en el Figma)
      L.polyline(linea, { color: '#03274d', weight: 9, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.capaRuta);
      L.polyline(linea, { color: '#fe7b13', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.capaRuta);
      // Viaje simulado: lo que ya recorrió se pinta gris encima (el bucle lo va alargando)
      if (untracked(this.simulacion)) {
        this.simRecorrida = L.polyline([], { color: '#9aa7b4', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false })
          .addTo(this.capaRuta);
        this.simUltimaLinea = 0;
      }
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
    const sim = this.simulacion();
    const puntos: L.LatLngExpression[] = (sim?.ruta.puntos ?? this.ruta()).map((p) => [p.lat, p.lng] as [number, number]);
    const c = sim ? this.simVisible : this.centro();
    const d = this.destino();
    const p = this.parada();
    if (c) puntos.push([c.lat, c.lng]);
    if (d) puntos.push([d.lat, d.lng]);
    if (p) puntos.push([p.lat, p.lng]);
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

  private iconoVehiculo(tipo: 'moto' | 'taxi', conRumbo = false): L.DivIcon {
    const vehiculo = `<span class="mv-mapa-vehiculo"><svg viewBox="0 0 24 24" aria-hidden="true">${tipo === 'taxi' ? SVG_TAXI : SVG_MOTO}</svg></span>`;
    return L.divIcon({
      className: '',
      html: conRumbo ? `<span class="mv-mapa-vehiculo-caja"><span class="mv-mapa-rumbo"></span>${vehiculo}</span>` : vehiculo,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }

  // ───────────── Viaje simulado ─────────────

  /** Entra, cambia de ruta o sale el viaje simulado. */
  private cambiarSimulacion(s: RecorridoSimulado | null): void {
    if (!this.mapa) return;
    if (!s) {
      if (this.simBucle !== null) cancelAnimationFrame(this.simBucle);
      this.simBucle = null;
      this.simMarcador?.remove();
      this.simMarcador = undefined;
      this.simRecorrida = undefined;
      this.simVersion = -1;
      this.simVisible = null;
      this.simRumbo = null;
      this.pintarMarcador(this.centro(), this.marcador());
      return;
    }
    // El marcador normal (GPS) se quita: manda la simulación
    if (this.animacion !== null) cancelAnimationFrame(this.animacion);
    this.animacion = null;
    this.punto?.remove();
    this.punto = undefined;
    const tipo = this.marcador() === 'taxi' ? 'taxi' : 'moto';
    const p = s.posicion(performance.now());
    if (!this.simMarcador) {
      this.simMarcador = L.marker([p.punto.lat, p.punto.lng], {
        icon: this.iconoVehiculo(tipo, true),
        keyboard: false,
        interactive: false,
        zIndexOffset: 600,
      }).addTo(this.mapa);
    }
    this.simVisible = p.punto;
    if (s.version !== this.simVersion) {
      this.simVersion = s.version;
      this.simRumbo = null;
      if (this.encuadrar()) this.encuadre();
      else this.mapa.setView(this.vista(p.punto, this.zoom()), this.zoom());
    }
    if (this.simBucle === null) this.simBucle = requestAnimationFrame(this.cuadroSimulado);
  }

  /** Un cuadro (60 por segundo): posición sobre la polilínea, rumbo suave, tramo recorrido y cámara. */
  private readonly cuadroSimulado = (t: number): void => {
    const s = untracked(this.simulacion);
    if (!s || !this.mapa || !this.simMarcador) {
      this.simBucle = null;
      return;
    }
    const p = s.posicion(performance.now());
    this.simMarcador.setLatLng([p.punto.lat, p.punto.lng]);
    this.simVisible = p.punto;

    // Rumbo: gira por el camino más corto y sin brusquedad
    this.simRumbo = this.simRumbo === null ? p.rumbo : girarHacia(this.simRumbo, p.rumbo, 0.18);
    const flecha = this.simMarcador.getElement()?.querySelector<HTMLElement>('.mv-mapa-rumbo');
    if (flecha) flecha.style.transform = `rotate(${this.simRumbo.toFixed(1)}deg)`;

    if (t - this.simUltimaLinea > LINEA_MS && this.simRecorrida) {
      this.simUltimaLinea = t;
      this.simRecorrida.setLatLngs(s.ruta.hasta(p.recorrido).map((q) => L.latLng(q.lat, q.lng)));
    }
    // Cámara: si el vehículo se acerca al borde de lo visible, se desliza para seguirlo
    if (t - this.simUltimoSeguir > SEGUIR_MS) {
      this.simUltimoSeguir = t;
      const aqui = L.latLng(p.punto.lat, p.punto.lng);
      if (!this.mapa.getBounds().pad(-0.2).contains(aqui)) {
        const z = this.mapa.getZoom();
        this.mapa.panTo(this.vista(p.punto, z), { animate: true, duration: 0.8 });
      }
    }
    this.simBucle = requestAnimationFrame(this.cuadroSimulado);
  };
}

/** Acerca el ángulo `actual` a `meta` (grados) por el lado más corto, una fracción `f` cada cuadro. */
export function girarHacia(actual: number, meta: number, f: number): number {
  const dif = ((meta - actual + 540) % 360) - 180;
  return (actual + dif * f + 360) % 360;
}

/** Los nombres vienen de OpenStreetMap o del usuario: se escapan antes de meterlos en el HTML del marcador. */
function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
