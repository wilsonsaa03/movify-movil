import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { IconoComponent } from '../icono/icono.component';
import { SelectorPuntoComponent } from '../selector-punto/selector-punto.component';
import { Lugar, LugaresService, Parte, distanciaKm, normalizar, resaltar } from '../../servicios/lugares.service';
import { UbicacionService } from '../../servicios/ubicacion.service';

/** Espera tras la última tecla antes de buscar calles en línea (las sugerencias locales son instantáneas). */
const ESPERA_MS = 300;
const MAX_OPCIONES = 8;

interface Opcion {
  lugar: Lugar;
  reciente: boolean;
  partes?: Parte[];
}

/**
 * Buscar un lugar de Buenaventura a pantalla completa (encima de la página): escribiendo la dirección,
 * eligiendo un reciente, tocando el mapa o, para la recogida, con el GPS.
 *
 *   @if (buscando()) { <app-buscador-lugar tipo="destino" titulo="¿A dónde lo llevamos?" (elegido)="..." (cerrar)="..." /> }
 */
@Component({
  selector: 'app-buscador-lugar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, SelectorPuntoComponent],
  templateUrl: './buscador-lugar.component.html',
  styleUrls: ['./buscador-lugar.component.scss'],
})
export class BuscadorLugarComponent implements AfterViewInit, OnDestroy {
  private readonly lugares = inject(LugaresService);
  private readonly gps = inject(UbicacionService);
  private readonly entrada = viewChild.required<ElementRef<HTMLInputElement>>('entrada');

  readonly tipo = input<'origen' | 'destino'>('destino');
  readonly titulo = input('¿A dónde lo llevamos?');
  readonly elegido = output<Lugar>();
  readonly cerrar = output<void>();

  readonly texto = signal('');
  readonly enLinea = signal<Lugar[]>([]);
  readonly cargando = signal(false);
  readonly error = signal('');
  readonly enMapa = signal(false);
  private readonly catalogo = signal<Lugar[]>([]);
  private readonly recientes = this.lugares.recientes();
  private temporizador?: ReturnType<typeof setTimeout>;
  private consulta?: AbortController;

  /** Sin texto: los recientes. Escribiendo: sugerencias locales primero y después lo que encuentre en línea. */
  readonly opciones = computed<Opcion[]>(() => {
    const t = this.texto().trim();
    if (!t) return this.recientes.map((lugar) => ({ lugar, reciente: true }));
    const locales = this.lugares.sugerir(t, this.catalogo(), this.recientes, 5);
    const otros = this.enLinea().filter((r) => !locales.some((l) => normalizar(l.nombre) === normalizar(r.nombre) && distanciaKm(l, r) < 0.06));
    return [...locales, ...otros].slice(0, MAX_OPCIONES).map((lugar) => ({
      lugar,
      reciente: this.recientes.includes(lugar),
      partes: resaltar(lugar.nombre, t),
    }));
  });

  constructor() {
    this.lugares.catalogo().then((c) => this.catalogo.set(c));
  }

  ngAfterViewInit(): void {
    // El teclado sube solo: lo primero que se hace aquí es escribir
    setTimeout(() => this.entrada().nativeElement.focus(), 250);
  }

  ngOnDestroy(): void {
    clearTimeout(this.temporizador);
    this.consulta?.abort();
  }

  escribir(valor: string): void {
    this.texto.set(valor);
    clearTimeout(this.temporizador);
    this.consulta?.abort();
    this.error.set('');
    if (valor.trim().length < 3) {
      this.enLinea.set([]);
      this.cargando.set(false);
      return;
    }
    this.cargando.set(true);
    this.temporizador = setTimeout(() => this.buscar(valor), ESPERA_MS);
  }

  elegir(l: Lugar): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.elegido.emit(l);
  }

  /** La recogida en la posición del GPS, con su dirección. */
  usarGps(): void {
    const u = this.gps.ubicacion();
    if (!u) {
      this.gps.actualizar();
      this.error.set('Todavía no tenemos tu ubicación. Activa el GPS o escribe la dirección.');
      return;
    }
    this.elegir({ nombre: 'Mi ubicación', detalle: u.direccion, barrio: u.barrio, lat: u.lat, lng: u.lng });
  }

  private async buscar(valor: string): Promise<void> {
    this.consulta = new AbortController();
    try {
      this.enLinea.set(await this.lugares.buscar(valor, this.consulta.signal));
      if (!this.opciones().length) {
        this.error.set(`No encontramos «${valor.trim()}» en Buenaventura. Prueba con el barrio, un sitio conocido o elígelo en el mapa.`);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && !this.opciones().length) this.error.set('No pudimos buscar. Revisa tu internet.');
    } finally {
      this.cargando.set(false);
    }
  }
}
