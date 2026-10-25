import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { AlertController, IonContent, IonFooter, NavController, ToastController, ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ErrorApi } from '../../../../core/api.service';
import { IconoComponent } from '../../../../componentes/icono/icono.component';
import { MapaCiudadComponent, PuntoMapa } from '../../../../componentes/mapa-ciudad/mapa-ciudad.component';
import { LugaresService } from '../../../../servicios/lugares.service';
import { TipoVehiculo, VehiculoCercano, ViajeService } from '../../../../servicios/viaje.service';
import { pesos } from '../../../../core/formato';

interface Opcion {
  tipo: TipoVehiculo;
  nombre: string;
  cupo: string;
  precio: number;
  recargo: number;
  llegada: number | null;
}

/** Cada cuánto se refrescan los carritos del mapa. */
const CERCANOS_MS = 15000;
/** Programar: desde 30 min y hasta 7 días (mismos límites que el backend). */
const MIN_PROGRAMAR_MIN = 30;
const MAX_PROGRAMAR_DIAS = 7;

/**
 * Viaje 3 · Elige moto o taxi ("Confirma tu viaje").
 * Ruta real en el mapa (OSRM, pasando por la parada si hay) con los conductores libres cerca, precio fijo de cada
 * vehículo (/api/tarifas/cotizar, con el recargo nocturno explicado) y en cuánto llega el más cercano.
 * Opciones del viaje: casco (moto), pasajeros, equipaje y mascota (taxi), "¿Para quién?" y "¿Cuándo?" (ahora o
 * programado). "Pedir moto" crea el servicio → Viaje 4 (Buscando); "Programar" lo deja para la hora elegida.
 */
@Component({
  selector: 'app-viaje-confirmar',
  templateUrl: 'viaje-confirmar.page.html',
  styleUrls: ['viaje-confirmar.page.scss'],
  imports: [IonContent, IonFooter, IconoComponent, MapaCiudadComponent],
})
export class ViajeConfirmarPage implements ViewDidEnter, ViewWillLeave, AfterViewInit, OnDestroy {
  private readonly nav = inject(NavController);
  private readonly alertas = inject(AlertController);
  private readonly avisos = inject(ToastController);
  private readonly lugares = inject(LugaresService);
  readonly viaje = inject(ViajeService);
  private readonly hojaRef = viewChild.required<ElementRef<HTMLElement>>('hoja');
  private medidor?: ResizeObserver;
  private refresco?: ReturnType<typeof setInterval>;

  readonly cargando = signal(true);
  readonly pidiendo = signal(false);
  readonly error = signal('');
  readonly ruta = signal<PuntoMapa[]>([]);
  readonly altoHoja = signal(0);
  readonly libres = signal<VehiculoCercano[]>([]);
  /** null = ahora. Si no, la fecha y hora del viaje programado. */
  readonly programado = signal<Date | null>(null);
  readonly eligiendoHora = signal(false);
  private readonly llegadas = signal<Record<TipoVehiculo, number | null>>({ moto: null, taxi: null });

  readonly origen = computed<PuntoMapa | null>(() => this.viaje.origen());
  readonly destino = computed(() => {
    const d = this.viaje.destino();
    return d ? { lat: d.lat, lng: d.lng, nombre: d.nombre } : null;
  });
  /** Solo los del tipo elegido (los de moto no le sirven a quien pide taxi). */
  readonly carritos = computed(() => this.libres().filter((v) => v.tipo_vehiculo === this.viaje.tipo()));

  /** "12 min · 4,2 km" con los números del backend (los mismos con los que cobra). */
  readonly etiqueta = computed(() => {
    const c = this.viaje.cotizacion();
    return c ? `${c.duracion_min} min · ${c.distancia_km.toFixed(1).replace('.', ',')} km` : null;
  });

  readonly opciones = computed<Opcion[]>(() => {
    const c = this.viaje.cotizacion();
    if (!c) return [];
    const orden: TipoVehiculo[] = ['moto', 'taxi'];
    return orden
      .map((tipo) => c.opciones.find((o) => o.tipo_vehiculo === tipo))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => ({
        tipo: o.tipo_vehiculo,
        nombre: o.tipo_vehiculo === 'moto' ? 'Moto' : 'Taxi',
        cupo: o.tipo_vehiculo === 'moto' ? '1 pasajero' : 'Hasta 4',
        precio: o.valor_estimado,
        recargo: o.recargo_nocturno_pct,
        llegada: this.llegadas()[o.tipo_vehiculo],
      }));
  });

  readonly elegida = computed(() => this.opciones().find((o) => o.tipo === this.viaje.tipo()) ?? null);
  readonly otro = computed(() => (this.viaje.tipo() === 'moto' ? 'taxi' : 'moto'));
  /** Lo que ofreció de más al reintentar ("Intentar ofreciendo +$1.000"). */
  readonly ofrecido = computed(() => {
    const o = this.viaje.ofrecido();
    const e = this.elegida();
    return o && e && o > e.precio ? o : null;
  });
  readonly pesos = pesos;

  /** "mar. 28 oct., 5:30 a. m." */
  readonly textoProgramado = computed(() => {
    const d = this.programado();
    return d ? new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d) : '';
  });
  /** Límites del selector de fecha y hora (hora local, formato de <input type="datetime-local">). */
  readonly minHora = computed(() => aLocal(new Date(Date.now() + (MIN_PROGRAMAR_MIN + 1) * 60000)));
  readonly maxHora = computed(() => aLocal(new Date(Date.now() + MAX_PROGRAMAR_DIAS * 86400000)));
  readonly valorHora = computed(() => {
    const d = this.programado();
    return d ? aLocal(d) : '';
  });

  ngAfterViewInit(): void {
    this.medidor = new ResizeObserver(() => this.altoHoja.set(this.hojaRef().nativeElement.offsetHeight));
    this.medidor.observe(this.hojaRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.medidor?.disconnect();
    clearInterval(this.refresco);
  }

  ionViewDidEnter(): void {
    if (!this.viaje.listoParaCotizar()) {
      this.nav.navigateRoot('/cliente/viaje/destino', { animationDirection: 'back' });
      return;
    }
    this.cargar();
    this.refresco = setInterval(() => this.cargarCercanos(), CERCANOS_MS);
  }

  ionViewWillLeave(): void {
    clearInterval(this.refresco);
  }

  volver(): void {
    this.nav.back();
  }

  elegir(t: TipoVehiculo): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    this.viaje.tipo.set(t);
    this.viaje.ofrecido.set(null); // la oferta era sobre el precio del otro vehículo
  }

  // ---------- Opciones del viaje ----------

  alternarCasco(): void {
    this.viaje.casco.update((c) => !c);
  }

  pasajeros(delta: number): void {
    this.viaje.pasajeros.update((n) => Math.min(4, Math.max(1, n + delta)));
  }

  quitarOferta(): void {
    this.viaje.ofrecido.set(null);
  }

  /** "¿Para quién?": nombre y celular de quien viaja (le llega un SMS con el conductor, la placa y el PIN). */
  async paraQuien(): Promise<void> {
    const actual = this.viaje.paraOtro();
    const alerta = await this.alertas.create({
      header: '¿Quién va a viajar?',
      message: 'Le enviaremos un SMS con el conductor, la placa y el PIN para empezar el viaje.',
      inputs: [
        { name: 'nombre', type: 'text', placeholder: 'Nombre', value: actual?.nombre ?? '', attributes: { maxlength: 80, autocomplete: 'name' } },
        { name: 'telefono', type: 'tel', placeholder: 'Celular (300 123 4567)', value: actual?.telefono ?? '', attributes: { maxlength: 16, inputmode: 'tel', autocomplete: 'tel' } },
      ],
      buttons: [
        ...(actual ? [{ text: 'Es para mí', role: 'mio' }] : []),
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Listo', role: 'ok' },
      ],
    });
    await alerta.present();
    const r = await alerta.onDidDismiss<{ values: { nombre: string; telefono: string } }>();
    if (r.role === 'mio') {
      this.viaje.paraOtro.set(null);
      return;
    }
    if (r.role !== 'ok') return;
    const nombre = (r.data?.values.nombre ?? '').trim();
    const digitos = (r.data?.values.telefono ?? '').replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '');
    if (!nombre || !/^3\d{9}$/.test(digitos)) {
      this.error.set(!nombre ? 'Escribe el nombre de quien va a viajar.' : 'El celular debe tener 10 dígitos y empezar por 3.');
      return;
    }
    this.error.set('');
    this.viaje.paraOtro.set({ nombre: nombre.slice(0, 80), telefono: digitos });
  }

  // ---------- ¿Cuándo? ----------

  ahora(): void {
    this.programado.set(null);
    this.eligiendoHora.set(false);
  }

  abrirHora(): void {
    this.eligiendoHora.set(true);
    if (!this.programado()) this.programado.set(new Date(Date.now() + 60 * 60000));
  }

  elegirHora(valor: string): void {
    const d = new Date(valor);
    if (!isNaN(d.getTime())) this.programado.set(d);
  }

  async pedir(): Promise<void> {
    if (this.pidiendo() || !this.elegida()) return;
    if (this.programado()) {
      await this.programar();
      return;
    }
    this.pidiendo.set(true);
    this.error.set('');
    try {
      const s = await this.viaje.pedir();
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
      this.viaje.olvidar();
      // Raíz: desde "Buscando" el botón atrás no debe volver a esta pantalla (el viaje ya existe)
      this.nav.navigateRoot('/cliente/viaje/buscando', { queryParams: { id: s.id } });
    } catch (e) {
      const err = e as ErrorApi;
      if (err.status === 409) {
        // Ya tiene un viaje andando: se lleva a ese en vez de crear otro
        const activo = await this.viaje.activo().catch(() => null);
        if (activo?.estado_codigo === 'buscando') {
          this.nav.navigateRoot('/cliente/viaje/buscando', { queryParams: { id: activo.id } });
          return;
        }
      }
      this.error.set(err.message || 'No pudimos pedir el viaje. Intenta de nuevo.');
    } finally {
      this.pidiendo.set(false);
    }
  }

  async reintentar(): Promise<void> {
    await this.cargar();
  }

  private async programar(): Promise<void> {
    const d = this.programado()!;
    if (this.viaje.parada()) {
      this.error.set('Los viajes programados todavía no admiten paradas. Quita la parada o pide el viaje ahora.');
      return;
    }
    if (d.getTime() < Date.now() + MIN_PROGRAMAR_MIN * 60000) {
      this.error.set(`Programa tu viaje con al menos ${MIN_PROGRAMAR_MIN} minutos de anticipación.`);
      return;
    }
    this.pidiendo.set(true);
    this.error.set('');
    try {
      const r = await this.viaje.programar(d);
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
      this.viaje.olvidar();
      (await this.avisos.create({ message: r.message, duration: 3500, position: 'top', color: 'dark' })).present();
      this.nav.navigateRoot('/cliente/pedidos', { queryParams: { programados: 1 } });
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos programar el viaje. Intenta de nuevo.');
    } finally {
      this.pidiendo.set(false);
    }
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    const o = this.viaje.origen()!;
    const d = this.viaje.destino()!;
    // Las consultas van en paralelo; la ruta, la llegada y los carritos son "extras" y no frenan el precio
    this.lugares.ruta(o, d, this.viaje.parada()).then((r) => this.ruta.set(r.puntos));
    this.viaje.llegadas().then((l) => this.llegadas.set(l));
    this.cargarCercanos();
    try {
      await this.viaje.cotizar();
    } catch (e) {
      this.error.set((e as ErrorApi).message || 'No pudimos calcular el precio.');
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarCercanos(): Promise<void> {
    const o = this.viaje.origen();
    if (o) this.libres.set(await this.viaje.cercanos(o));
  }
}

/** Date → "2026-10-25T17:30" en la hora del celular (lo que entiende <input type="datetime-local">). */
function aLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
