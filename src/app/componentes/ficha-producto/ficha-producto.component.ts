import { AfterViewInit, Component, ElementRef, HostListener, computed, input, output, signal, viewChild } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { pesos, urlFoto } from '../../core/formato';
import { contenidoProhibido } from '../../servicios/contenido-prohibido';
import { GrupoOpciones, Opcion, Producto } from '../../servicios/catalogo-domicilio.service';

export interface ProductoElegido {
  opciones: { id: number; nombre: string; precio_extra: number }[];
  cantidad: number;
  nota: string | null;
  precioUnitario: number;
}

/**
 * Ficha del producto (hoja que sube desde abajo, como en Rappi): foto, descripción, grupos de opciones
 * (obligatorio "elige 1" = radio; opcional "hasta 3" = casillas), nota para el comercio, cantidad y
 * "Agregar $X" que ya suma las opciones × la cantidad. El botón no se activa hasta completar lo obligatorio.
 *
 *   <app-ficha-producto [producto]="p" [abierto]="tienda.abierto" (agregar)="..." (cerrar)="..." />
 */
@Component({
  selector: 'app-ficha-producto',
  template: `
    <div class="fondo" (click)="cerrar.emit()" aria-hidden="true"></div>
    <section #hoja class="hoja" role="dialog" aria-modal="true" [attr.aria-label]="producto().nombre" tabindex="-1">
      <span class="asa" aria-hidden="true"></span>
      <button type="button" class="x" aria-label="Cerrar" (click)="cerrar.emit()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <div class="desliza">
        @if (urlFoto(producto().foto_url); as f) { <img class="foto" [src]="f" alt="" /> }
        <h2>{{ producto().nombre }} @if (producto().solo_mayores) { <i class="mayores">+18</i> }</h2>
        @if (producto().descripcion) { <p class="desc">{{ producto().descripcion }}</p> }
        <p class="base">{{ pesos(producto().precio) }}</p>

        @for (g of producto().grupos; track g.id) {
          <fieldset class="grupo">
            <legend>
              <b>{{ g.nombre }}</b>
              <small [class.falta]="intento() && faltan(g)">{{ ayudaGrupo(g) }}</small>
            </legend>
            @for (o of g.opciones; track o.id) {
              <label class="opcion" [class.agotada]="!o.disponible" [class.marcada]="marcada(o.id)">
                <input [type]="g.maximo === 1 ? 'radio' : 'checkbox'" [name]="'g' + g.id" [checked]="marcada(o.id)"
                       [disabled]="!o.disponible || (!marcada(o.id) && g.maximo > 1 && lleno(g))" (change)="tocar(g, o)" />
                <span class="marca" [class.redonda]="g.maximo === 1" aria-hidden="true"></span>
                <span class="nombre">{{ o.nombre }}@if (!o.disponible) { <small> · agotado</small> }</span>
                @if (o.precio_extra > 0) { <span class="extra">+{{ pesos(o.precio_extra) }}</span> }
              </label>
            }
          </fieldset>
        }

        <label class="nota">
          <b>¿Alguna indicación?</b>
          <textarea rows="2" maxlength="200" placeholder="Ej.: bien asada, sin hielo…" [value]="nota()" (input)="nota.set($any($event.target).value)"></textarea>
        </label>
        @if (notaProhibida(); as cat) {
          <p class="error" role="alert">La nota menciona {{ cat }}: no podemos llevar eso.</p>
        }
      </div>

      <div class="pie-ficha">
        <div class="cantidad" role="group" aria-label="Cantidad">
          <button type="button" aria-label="Quitar uno" [disabled]="cantidad() <= 1" (click)="cantidad.set(cantidad() - 1)">−</button>
          <output aria-live="polite">{{ cantidad() }}</output>
          <button type="button" aria-label="Agregar uno" [disabled]="cantidad() >= 20" (click)="cantidad.set(cantidad() + 1)">+</button>
        </div>
        <button type="button" class="agregar" [disabled]="!producto().disponible || !abierto()" (click)="confirmar()">
          @if (!producto().disponible) { Agotado }
          @else if (!abierto()) { Comercio cerrado }
          @else { Agregar {{ pesos(total()) }} }
        </button>
      </div>
      @if (intento() && !valido()) {
        <p class="error falta-texto" role="alert">Completa lo que dice "Obligatorio".</p>
      }
    </section>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; justify-content: flex-end;
      font-family: 'Nunito', system-ui, sans-serif; color: #03274d; }
    .fondo { position: absolute; inset: 0; background: rgba(3, 39, 77, 0.45); animation: aparece 200ms ease; }
    .hoja { position: relative; max-height: 92%; display: flex; flex-direction: column; border-radius: 26px 26px 0 0;
      background: #fff; box-shadow: 0 -10px 30px rgba(3, 39, 77, 0.2); outline: none;
      animation: subir 280ms cubic-bezier(0.23, 1, 0.32, 1); }
    @keyframes subir { from { transform: translateY(100%); } }
    @keyframes aparece { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .hoja, .fondo { animation: aparece 150ms ease; } }
    .asa { align-self: center; width: 44px; height: 5px; margin: 10px 0 2px; border-radius: 3px; background: #d5dee8; }
    .x { position: absolute; right: 12px; top: 10px; width: 40px; height: 40px; border: 0; border-radius: 50%;
      display: grid; place-items: center; background: #eef3f8; color: #03274d; cursor: pointer; z-index: 1; }
    .x svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; }
    .desliza { overflow-y: auto; padding: 6px 18px 12px; -webkit-overflow-scrolling: touch; }
    .foto { width: 100%; max-height: 200px; object-fit: cover; border-radius: 18px; margin: 6px 0 4px; background: #eef3f8; }
    h2 { margin: 8px 48px 4px 0; font-family: 'Baloo 2', system-ui, sans-serif; font-size: 24px; line-height: 1.15; font-weight: 800; }
    .desc { margin: 0 0 6px; font-size: 14px; font-weight: 700; color: #5b6b80; line-height: 1.4; }
    .base { margin: 0 0 10px; font-size: 17px; font-weight: 900; }
    .mayores { margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: #fde3e5; color: #b42333;
      font-size: 12px; font-style: normal; font-weight: 900; vertical-align: 4px; }
    .grupo { margin: 0 0 12px; padding: 0; border: 0; min-width: 0; }
    legend { width: 100%; padding: 10px 12px; margin-bottom: 4px; border-radius: 12px; background: #f2f6fa;
      display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    legend b { font-size: 15px; font-weight: 800; }
    legend small { font-size: 12px; font-weight: 800; color: #5b6b80; white-space: nowrap; }
    legend small.falta { color: #b42333; }
    .opcion { position: relative; min-height: 50px; padding: 4px 6px; border-bottom: 1px solid #eef2f6;
      display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 15px; font-weight: 700; }
    .opcion input { position: absolute; opacity: 0; pointer-events: none; }
    .marca { width: 22px; height: 22px; flex-shrink: 0; border: 2.5px solid #b8c5d4; border-radius: 6px; transition: all 150ms ease; }
    .marca.redonda { border-radius: 50%; }
    .opcion.marcada .marca { border-color: #03274d; background: #03274d; box-shadow: inset 0 0 0 3px #fff; }
    .opcion:has(input:focus-visible) { outline: 3px solid #02aab4; outline-offset: 1px; border-radius: 8px; }
    .opcion.agotada { color: #9aa7b4; cursor: default; }
    .nombre { flex: 1; min-width: 0; }
    .nombre small { font-size: 12px; }
    .extra { font-size: 14px; font-weight: 800; color: #5b6b80; }
    .nota { display: grid; gap: 6px; margin-top: 4px; }
    .nota b { font-size: 15px; font-weight: 800; }
    textarea { width: 100%; padding: 12px 14px; border: 2px solid #d5dee8; border-radius: 14px; resize: none; outline: none;
      background: #f6f9fc; font-family: inherit; font-size: 16px; font-weight: 700; color: #03274d; box-sizing: border-box; }
    textarea:focus { border-color: #02aab4; background: #fff; }
    .pie-ficha { padding: 10px 18px calc(12px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
      display: flex; align-items: center; gap: 12px; border-top: 1px solid #eef2f6; }
    .cantidad { display: inline-flex; align-items: center; gap: 4px; padding: 3px; border-radius: 999px; background: #eef3f8; }
    .cantidad button { width: 40px; height: 40px; border: 0; border-radius: 50%; background: #fff; color: #03274d;
      font-size: 20px; font-weight: 900; cursor: pointer; }
    .cantidad button:disabled { opacity: 0.4; }
    .cantidad output { min-width: 26px; text-align: center; font-size: 17px; font-weight: 900; }
    .agregar { flex: 1; min-height: 52px; border: 0; border-radius: 16px; background: #fe7b13; color: #fff;
      font-family: inherit; font-size: 16px; font-weight: 900; cursor: pointer; box-shadow: 0 6px 0 #d9620a; }
    .agregar:disabled { background: #c9d4e0; box-shadow: none; }
    .agregar:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 4px 0 #d9620a; }
    .error { margin: 6px 0 0; font-size: 13px; font-weight: 800; color: #b42333; }
    .falta-texto { padding: 0 18px 10px; margin: 0; }
  `,
})
export class FichaProductoComponent implements AfterViewInit {
  readonly producto = input.required<Producto>();
  readonly abierto = input(true);
  readonly agregar = output<ProductoElegido>();
  readonly cerrar = output<void>();
  private readonly hoja = viewChild<ElementRef<HTMLElement>>('hoja');

  readonly elegidas = signal<Set<number>>(new Set());
  readonly cantidad = signal(1);
  readonly nota = signal('');
  readonly intento = signal(false);
  readonly pesos = pesos;
  readonly urlFoto = urlFoto;

  readonly notaProhibida = computed(() => contenidoProhibido(this.nota()));
  readonly extras = computed(() =>
    this.producto().grupos.flatMap((g) => g.opciones).filter((o) => this.elegidas().has(o.id)).reduce((s, o) => s + Number(o.precio_extra), 0),
  );
  readonly unitario = computed(() => Number(this.producto().precio) + this.extras());
  readonly total = computed(() => this.unitario() * this.cantidad());
  readonly valido = computed(() => this.producto().grupos.every((g) => !this.faltan(g)) && !this.notaProhibida());

  ngAfterViewInit(): void {
    this.hoja()?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  alEscape(): void {
    this.cerrar.emit();
  }

  marcada(id: number): boolean {
    return this.elegidas().has(id);
  }

  cuantas(g: GrupoOpciones): number {
    return g.opciones.filter((o) => this.elegidas().has(o.id)).length;
  }

  faltan(g: GrupoOpciones): boolean {
    return this.cuantas(g) < g.minimo;
  }

  lleno(g: GrupoOpciones): boolean {
    return this.cuantas(g) >= g.maximo;
  }

  ayudaGrupo(g: GrupoOpciones): string {
    if (g.minimo >= 1) return g.minimo === g.maximo ? `Obligatorio · elige ${g.minimo}` : `Obligatorio · ${g.minimo} a ${g.maximo}`;
    return g.maximo === 1 ? 'Opcional' : `Opcional · hasta ${g.maximo}`;
  }

  /** Radio (máximo 1): reemplaza. Casillas: marca o desmarca sin pasar del máximo. */
  tocar(g: GrupoOpciones, o: Opcion): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    const s = new Set(this.elegidas());
    if (g.maximo === 1) {
      const yaEstaba = s.has(o.id);
      g.opciones.forEach((x) => s.delete(x.id));
      // En un grupo opcional de 1 se puede desmarcar tocando otra vez
      if (!(yaEstaba && g.minimo === 0)) s.add(o.id);
    } else if (s.has(o.id)) {
      s.delete(o.id);
    } else if (!this.lleno(g)) {
      s.add(o.id);
    }
    this.elegidas.set(s);
  }

  confirmar(): void {
    if (!this.valido()) {
      this.intento.set(true);
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
      return;
    }
    const opciones = this.producto()
      .grupos.flatMap((g) => g.opciones)
      .filter((o) => this.elegidas().has(o.id))
      .map((o) => ({ id: o.id, nombre: o.nombre, precio_extra: Number(o.precio_extra) }));
    this.agregar.emit({ opciones, cantidad: this.cantidad(), nota: this.nota().trim() || null, precioUnitario: this.unitario() });
  }
}
