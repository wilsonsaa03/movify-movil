import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** La entrada animada solo se muestra la primera vez que se abre la app. */
let introYaMostrada = false;

@Component({
  selector: 'app-bienvenida',
  templateUrl: 'bienvenida.page.html',
  styleUrls: ['bienvenida.page.scss'],
  imports: [IonContent],
})
export class BienvenidaPage {
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly pista = viewChild.required<ElementRef<HTMLElement>>('pista');
  private readonly perilla = viewChild.required<ElementRef<HTMLElement>>('perilla');
  private readonly relleno = viewChild.required<ElementRef<HTMLElement>>('relleno');
  private readonly texto = viewChild.required<ElementRef<HTMLElement>>('texto');

  readonly conIntro = !introYaMostrada;
  readonly arrastrando = signal(false);
  readonly hecho = signal(false);
  readonly saliendo = signal(false);

  // Estado del arrastre (no son signals porque cambian en cada frame)
  private punteroId: number | null = null;
  private inicioX = 0;
  private x = 0;
  private maximo = 0;
  private movido = 0;
  private avisoUmbral = false;
  private muestras: { x: number; t: number }[] = [];

  /** Arrastre mínimo para aceptar (0 a 1) y velocidad para aceptar con un "flick" (px/ms). */
  private readonly UMBRAL = 0.82;
  private readonly VELOCIDAD_FLICK = 0.9;

  constructor() {
    introYaMostrada = true;
  }

  /** Si el usuario vuelve atrás a esta pantalla, el deslizador arranca de cero. */
  ionViewWillEnter(): void {
    this.hecho.set(false);
    this.saliendo.set(false);
    this.x = 0;
    this.pintar(0, false);
  }

  /** Un toque durante la entrada la termina de inmediato. */
  saltarIntro(): void {
    const animaciones = this.host.nativeElement.getAnimations({ subtree: true });
    for (const a of animaciones) {
      if (a.effect?.getTiming().iterations !== Infinity && a.playState === 'running') a.finish();
    }
  }

  alPresionar(e: PointerEvent): void {
    if (this.punteroId !== null || this.hecho()) return; // ignora un segundo dedo
    e.stopPropagation();
    this.punteroId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    this.maximo = this.calcularMaximo();
    this.inicioX = e.clientX - this.x;
    this.movido = 0;
    this.avisoUmbral = false;
    this.muestras = [{ x: this.x, t: e.timeStamp }];
    this.arrastrando.set(true);
  }

  alMover(e: PointerEvent): void {
    if (e.pointerId !== this.punteroId) return;
    const crudo = e.clientX - this.inicioX;
    this.movido = Math.max(this.movido, Math.abs(crudo - this.x));

    // Fricción en los bordes en vez de un tope seco
    let x = crudo;
    if (x < 0) x = x * 0.2;
    if (x > this.maximo) x = this.maximo + (x - this.maximo) * 0.2;
    this.x = x;

    const progreso = Math.min(Math.max(x / this.maximo, 0), 1);
    this.pintar(x, false);

    if (progreso >= this.UMBRAL && !this.avisoUmbral) {
      this.avisoUmbral = true;
      this.vibrar(ImpactStyle.Light);
    } else if (progreso < this.UMBRAL) {
      this.avisoUmbral = false;
    }

    this.muestras.push({ x, t: e.timeStamp });
    if (this.muestras.length > 5) this.muestras.shift();
  }

  alSoltar(e: PointerEvent): void {
    if (e.pointerId !== this.punteroId) return;
    this.punteroId = null;
    this.arrastrando.set(false);

    // Fue un toque, no un arrastre: le enseñamos el gesto con un empujoncito
    if (this.movido < 4) {
      this.empujoncito();
      return;
    }

    const a = this.muestras[0];
    const b = this.muestras[this.muestras.length - 1];
    const velocidad = (b.x - a.x) / Math.max(b.t - a.t, 1);
    const progreso = this.x / this.maximo;

    if (progreso >= this.UMBRAL || (velocidad > this.VELOCIDAD_FLICK && progreso > 0.3)) {
      this.completar();
    } else {
      this.x = 0;
      this.pintar(0, true);
    }
  }

  /** Accesibilidad: con teclado (Enter, Espacio o flecha derecha) también se puede continuar. */
  alTeclado(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.maximo = this.calcularMaximo();
      this.completar();
    }
  }

  private completar(): void {
    if (this.hecho()) return;
    this.hecho.set(true);
    this.x = this.maximo;
    this.pintar(this.maximo, true);
    this.vibrar(ImpactStyle.Medium);

    setTimeout(() => this.saliendo.set(true), 320);
    setTimeout(() => this.router.navigateByUrl('/inicio', { replaceUrl: true }), 620);
  }

  private empujoncito(): void {
    const perilla = this.perilla().nativeElement;
    perilla.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(34px)', offset: 0.35 },
        { transform: 'translateX(-4px)', offset: 0.75 },
        { transform: 'translateX(0)' },
      ],
      { duration: 560, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    );
  }

  /** Mueve la perilla y actualiza el relleno y el texto. Solo usa transform y opacity. */
  private pintar(x: number, conTransicion: boolean): void {
    const perilla = this.perilla().nativeElement;
    const relleno = this.relleno().nativeElement;
    const texto = this.texto().nativeElement;
    const max = this.maximo || this.calcularMaximo();
    const progreso = Math.min(Math.max(x / max, 0), 1);

    const transicion = conTransicion
      ? this.hecho()
        ? 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease'
        : 'transform 480ms cubic-bezier(0.34, 1.4, 0.5, 1), opacity 300ms ease'
      : 'none';

    const presion = 'scale 140ms cubic-bezier(0.23, 1, 0.32, 1)';
    perilla.style.transition = transicion === 'none' ? presion : `${transicion}, ${presion}`;
    relleno.style.transition = transicion;
    texto.style.transition = conTransicion ? 'opacity 300ms ease' : 'none';

    perilla.style.transform = `translateX(${x}px)`;
    relleno.style.transform = `translateX(${x - max}px)`;
    texto.style.opacity = String(Math.max(1 - progreso * 1.8, 0));
  }

  private calcularMaximo(): number {
    const pista = this.pista().nativeElement.getBoundingClientRect().width;
    const perilla = this.perilla().nativeElement.getBoundingClientRect().width;
    return pista - perilla - 12; // 6px de margen a cada lado
  }

  private vibrar(estilo: ImpactStyle): void {
    Haptics.impact({ style: estilo }).catch(() => undefined);
  }
}
