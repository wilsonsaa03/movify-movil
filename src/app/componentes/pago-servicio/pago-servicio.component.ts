import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ErrorApi } from '../../core/api.service';
import { pesos } from '../../core/formato';
import { SesionService } from '../../core/sesion.service';
import { TiempoRealService } from '../../core/tiempo-real.service';
import { BancoPse, EstadoPagoServicio, MetodoDigital, MetodoPago, NOMBRE_METODO, PagosService, PedidoPago, esDigital } from '../../servicios/pagos.service';

/** Mientras un cobro está pendiente se pregunta cómo va (además del aviso por WebSocket). */
const SONDEO_MS = 3000;

/**
 * Pago del servicio terminado, por el medio que el cliente eligió al pedir:
 *  - Nequi: aprueba en su app Nequi.          - Daviplata: escribe el código del SMS.
 *  - Tarjeta: número, fecha y código; van directo a Wompi (token), nunca a MoviFY.
 *  - PSE: tipo de persona, documento y banco → página del banco.   - Bancolombia: página de Bancolombia.
 * Si el pago no se aprueba, puede intentar de nuevo o pagar en efectivo. El conductor solo ve si ya pagó.
 *
 *   <app-pago-servicio [servicioId]="id" rol="cliente" />
 */
@Component({
  selector: 'app-pago-servicio',
  template: `
    @if (e(); as p) {
      @if (rol() === 'conductor') {
        @if (p.metodo_pago !== 'efectivo' || p.pago) {
          <p class="linea" [class]="'linea ' + (p.pago?.estado ?? 'pendiente')" role="status">{{ textoConductor() }}</p>
        }
      } @else {
        <section class="pago" aria-label="Pago">
          @switch (p.pago?.estado) {
            @case ('aprobado') {
              <p class="ok"><b>¡Pagado!</b> {{ nombre(p.pago!.metodo) }} {{ p.pago!.cuenta_mascara }} · {{ pesos(p.pago!.monto) }}</p>
            }
            @case ('pendiente') {
              @if (p.pago!.requiere_otp) {
                <p><b>Escribe el código de Daviplata</b><br />Te llegó por SMS. {{ p.pago!.detalle }}</p>
                <div class="fila">
                  <label class="sr-only" for="pago-otp">Código de 6 números</label>
                  <input id="pago-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"
                         [value]="codigo()" (input)="escribirCodigo($any($event.target).value)" />
                  <button type="button" class="principal" [disabled]="codigo().length !== 6 || ocupado()" (click)="confirmarCodigo()">Confirmar</button>
                </div>
              } @else {
                <p class="espera"><span class="girando" aria-hidden="true"></span>
                  <span><b>{{ tituloPendiente(p.pago!.metodo, p.pago!.monto) }}</b><br />{{ p.pago!.detalle }}</span></p>
                @if (p.pago!.url_pago) {
                  <a class="principal ancho boton" [href]="p.pago!.url_pago" target="_blank" rel="noopener">
                    Ir a la página de {{ p.pago!.metodo === 'pse' ? 'tu banco' : 'Bancolombia' }}
                  </a>
                }
              }
              <button type="button" class="enlace" [disabled]="ocupado()" (click)="enEfectivo()">Mejor pago en efectivo</button>
            }
            @default {
              @if (p.pago && p.pago.estado !== 'cancelado') {
                <p class="mal">{{ p.pago.detalle || 'El pago no se aprobó' }}. Puedes intentar de nuevo o pagar en efectivo.</p>
              }
              @if (p.puede_pagar && esDigital(p.metodo_pago)) {
                <!-- Se cobra por el medio que eligió al pedir el servicio -->
                <p><b>Paga con {{ nombre(metodo()) }}</b></p>
                @switch (metodo()) {
                  @case ('nequi') {
                    <label class="campo"><span>Celular de Nequi</span>
                      <input inputmode="numeric" maxlength="10" autocomplete="tel-national" [value]="celular()" (input)="celular.set(digitos($any($event.target).value, 10))" /></label>
                  }
                  @case ('daviplata') {
                    <label class="campo"><span>Cédula (Daviplata)</span>
                      <input inputmode="numeric" maxlength="10" [value]="cedula()" (input)="cedula.set(digitos($any($event.target).value, 10))" /></label>
                  }
                  @case ('tarjeta') {
                    <label class="campo"><span>Número de la tarjeta</span>
                      <input inputmode="numeric" autocomplete="cc-number" maxlength="23" [value]="tarjetaNumero()"
                             (input)="escribirTarjeta($any($event.target).value)" placeholder="0000 0000 0000 0000" /></label>
                    <div class="dos">
                      <label class="campo"><span>Vence (MM/AA)</span>
                        <input inputmode="numeric" autocomplete="cc-exp" maxlength="5" [value]="vence()" (input)="escribirVence($any($event.target).value)" placeholder="12/29" /></label>
                      <label class="campo"><span>Código (CVC)</span>
                        <input inputmode="numeric" autocomplete="cc-csc" maxlength="4" type="password" [value]="cvc()" (input)="cvc.set(digitos($any($event.target).value, 4))" /></label>
                    </div>
                    <label class="campo"><span>Nombre como aparece en la tarjeta</span>
                      <input autocomplete="cc-name" maxlength="60" [value]="titular()" (input)="titular.set($any($event.target).value)" /></label>
                    <label class="campo"><span>Cuotas</span>
                      <select [value]="cuotas()" (change)="cuotas.set($any($event.target).value)">
                        @for (c of opcionesCuotas; track c) { <option [value]="c">{{ c }}</option> }
                      </select></label>
                    <small class="nota">Los datos de tu tarjeta van directo a Wompi, la pasarela de pagos. MoviFY no los guarda.</small>
                  }
                  @case ('pse') {
                    <div class="dos">
                      <label class="campo"><span>Persona</span>
                        <select [value]="tipoPersona()" (change)="tipoPersona.set($any($event.target).value)">
                          <option value="natural">Natural</option><option value="juridica">Jurídica (empresa)</option>
                        </select></label>
                      <label class="campo"><span>Documento</span>
                        <select [value]="tipoDocumento()" (change)="tipoDocumento.set($any($event.target).value)">
                          <option value="CC">Cédula</option><option value="NIT">NIT</option>
                        </select></label>
                    </div>
                    <label class="campo"><span>Número de documento</span>
                      <input inputmode="numeric" maxlength="12" [value]="documento()" (input)="documento.set(digitos($any($event.target).value, 12))" /></label>
                    <label class="campo"><span>Tu banco</span>
                      <select [value]="banco()" (change)="banco.set($any($event.target).value)">
                        <option value="">Elige tu banco</option>
                        @for (b of bancos(); track b.codigo) { <option [value]="b.codigo">{{ b.nombre }}</option> }
                      </select></label>
                  }
                  @case ('bancolombia') {
                    <p class="nota">Te llevamos a la página de Bancolombia para que apruebes la transferencia.</p>
                  }
                }
                <button type="button" class="principal ancho" [disabled]="!listo() || ocupado()" (click)="pagar()">
                  {{ ocupado() ? 'Un momento…' : 'Pagar ' + pesos(p.monto) + ' con ' + nombre(metodo()) }}
                </button>
                @if (p.de_prueba && p.pruebas; as t) {
                  <p class="prueba">Modo de prueba (sin plata real). {{ ayudaPrueba(t) }}</p>
                }
                @if (p.terminos_url) {
                  <p class="prueba">Al pagar aceptas los <a [href]="p.terminos_url" target="_blank" rel="noopener">términos de Wompi</a>.</p>
                }
              } @else if (!p.pago || p.pago.estado === 'cancelado' || p.metodo_pago === 'efectivo') {
                <p>Pagas {{ pesos(p.monto) }} en efectivo al conductor.</p>
              }
              @if (p.pago && p.pago.estado !== 'cancelado' && p.metodo_pago !== 'efectivo') {
                <button type="button" class="enlace" [disabled]="ocupado()" (click)="enEfectivo()">Mejor pago en efectivo</button>
              }
            }
          }
          @if (error()) { <p class="mal" role="alert">{{ error() }}</p> }
        </section>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .pago { margin: 0 0 12px; padding: 14px; border-radius: 16px; background: #f3f6fa; color: #03274d; font: 600 14px 'Nunito', system-ui, sans-serif; }
    p { margin: 0 0 10px; }
    .ok { color: #1d6b34; }
    .mal { color: #c0392b; }
    .prueba { margin: 8px 0 0; font-size: 12px; color: #8a5a00; }
    .nota { display: block; margin: 0 0 10px; font-size: 12px; color: #4f6275; }
    .espera { display: flex; gap: 10px; align-items: flex-start; }
    .girando { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; border: 3px solid #c9d4e0; border-top-color: #03274d; animation: girar 900ms linear infinite; }
    @keyframes girar { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .girando { animation: none; } }
    button, .boton { min-height: 44px; border-radius: 12px; border: 1.5px solid #c9d4e0; background: #fff; color: #03274d; font: 800 14px 'Nunito', system-ui, sans-serif; }
    button:disabled { opacity: 0.5; }
    .principal { background: #03274d; border-color: #03274d; color: #fff; padding: 0 14px; }
    .boton { display: grid; place-items: center; margin-bottom: 8px; text-decoration: none; }
    .ancho { width: 100%; }
    .enlace { border: 0; background: none; min-height: 36px; padding: 0; text-decoration: underline; font-weight: 700; }
    .campo { display: grid; gap: 4px; margin-bottom: 10px; font-size: 13px; min-width: 0; }
    input, select { min-height: 44px; padding: 0 12px; border-radius: 12px; border: 1.5px solid #c9d4e0; background: #fff; font: 800 16px 'Nunito', system-ui, sans-serif; color: #03274d; min-width: 0; width: 100%; box-sizing: border-box; }
    .dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-bottom: 8px; }
    .linea { margin: 0 0 12px; padding: 10px 12px; border-radius: 12px; background: #fff1d6; color: #8a5a00; font: 800 13px 'Nunito', system-ui, sans-serif; }
    .linea.aprobado { background: #e1f5e6; color: #1d6b34; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `,
})
export class PagoServicioComponent implements OnInit, OnDestroy {
  private readonly pagos = inject(PagosService);
  private readonly sesion = inject(SesionService);
  private readonly tiempoReal = inject(TiempoRealService);
  readonly servicioId = input.required<number>();
  readonly rol = input<'cliente' | 'conductor'>('cliente');

  readonly e = signal<EstadoPagoServicio | null>(null);
  readonly metodo = signal<MetodoDigital>('nequi');
  readonly celular = signal('');
  readonly cedula = signal('');
  readonly tarjetaNumero = signal('');
  readonly vence = signal('');
  readonly cvc = signal('');
  readonly titular = signal('');
  readonly cuotas = signal('1');
  readonly tipoPersona = signal<'natural' | 'juridica'>('natural');
  readonly tipoDocumento = signal<'CC' | 'NIT'>('CC');
  readonly documento = signal('');
  readonly banco = signal('');
  readonly bancos = signal<BancoPse[]>([]);
  readonly codigo = signal('');
  readonly ocupado = signal(false);
  readonly error = signal('');
  readonly pesos = pesos;
  readonly esDigital = esDigital;
  readonly opcionesCuotas = ['1', '2', '3', '6', '12', '24', '36'];

  private sondeo?: ReturnType<typeof setInterval>;
  private dejarDeSeguir: () => void = () => undefined;
  private estadoAntes: string | null = null;
  private bancosPedidos = false;

  /** ¿Están los datos que pide el medio elegido? */
  readonly listo = computed(() => {
    switch (this.metodo()) {
      case 'nequi':
        return /^3\d{9}$/.test(this.celular());
      case 'daviplata':
        return /^\d{5,10}$/.test(this.cedula());
      case 'tarjeta': {
        const n = this.tarjetaNumero().replace(/\D/g, '');
        return n.length >= 13 && n.length <= 19 && /^\d{2}\/\d{2}$/.test(this.vence()) && /^\d{3,4}$/.test(this.cvc()) && this.titular().trim().length >= 3;
      }
      case 'pse':
        return /^\d{5,12}$/.test(this.documento()) && !!this.banco();
      default:
        return true;
    }
  });
  readonly textoConductor = computed(() => {
    const p = this.e();
    if (!p) return '';
    const app = NOMBRE_METODO[p.pago?.metodo ?? p.metodo_pago];
    switch (p.pago?.estado) {
      case 'aprobado':
        return `Pagó ${pesos(p.pago.monto)} con ${app}. No le cobres en efectivo.`;
      case 'pendiente':
        return `Pagando con ${app}… espera la confirmación.`;
      case 'rechazado':
      case 'error':
      case 'cancelado':
        return `El pago con ${app} no se aprobó: cóbrale ${pesos(p.monto)} en efectivo.`;
      default:
        return `Va a pagar ${pesos(p.monto)} con ${app} desde la app.`;
    }
  });

  ngOnInit(): void {
    // Celular y nombre de la cuenta como sugerencia
    const d = this.sesion.datos();
    const tel = (d?.telefono ?? '').replace(/\D/g, '');
    if (tel) this.celular.set(tel.length === 12 && tel.startsWith('57') ? tel.slice(2) : tel);
    this.titular.set([d?.nombres, d?.apellidos].filter(Boolean).join(' ').toUpperCase());
    this.leer();
    this.sondeo = setInterval(() => {
      if (this.e()?.pago?.estado === 'pendiente') this.leer();
    }, SONDEO_MS);
    this.dejarDeSeguir = this.tiempoReal.seguir(this.servicioId(), (ev) => {
      if (ev.tipo === 'pago') this.leer();
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.sondeo);
    this.dejarDeSeguir();
  }

  nombre(m: MetodoPago): string {
    return NOMBRE_METODO[m];
  }

  digitos(texto: string, max: number): string {
    return texto.replace(/\D/g, '').slice(0, max);
  }

  escribirCodigo(texto: string): void {
    this.codigo.set(this.digitos(texto, 6));
  }

  /** 4242424242424242 → "4242 4242 4242 4242" */
  escribirTarjeta(texto: string): void {
    this.tarjetaNumero.set(this.digitos(texto, 19).replace(/(\d{4})(?=\d)/g, '$1 '));
  }

  /** 1229 → "12/29" */
  escribirVence(texto: string): void {
    const d = this.digitos(texto, 4);
    this.vence.set(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
  }

  tituloPendiente(m: MetodoDigital, monto: number): string {
    switch (m) {
      case 'nequi':
        return `Abre Nequi y aprueba el pago de ${pesos(monto)}`;
      case 'tarjeta':
        return `Pagando ${pesos(monto)} con tu tarjeta`;
      case 'pse':
        return `Termina el pago de ${pesos(monto)} en tu banco`;
      case 'bancolombia':
        return `Aprueba la transferencia de ${pesos(monto)} en Bancolombia`;
      default:
        return `Pagando ${pesos(monto)}`;
    }
  }

  ayudaPrueba(t: NonNullable<EstadoPagoServicio['pruebas']>): string {
    switch (this.metodo()) {
      case 'nequi':
        return `Nequi: cualquier celular aprueba; ${t.nequi_rechaza} rechaza.`;
      case 'daviplata':
        return 'Daviplata: cualquier cédula y cualquier código de 6 números aprueba; 932015 rechaza.';
      case 'tarjeta':
        return `Tarjeta: cualquier número aprueba; ${t.tarjeta_rechaza} rechaza (fecha futura y CVC de 3 números).`;
      case 'pse':
        return 'PSE: elige "Banco que aprueba" o "Banco que rechaza".';
      default:
        return 'Bancolombia: en la página de prueba eliges si se aprueba o no.';
    }
  }

  async pagar(): Promise<void> {
    await this.hacer(async () => {
      const m = this.metodo();
      const pedido: PedidoPago = { metodo: m };
      if (m === 'nequi') pedido.cuenta = this.celular();
      if (m === 'daviplata') pedido.cuenta = this.cedula();
      if (m === 'pse') Object.assign(pedido, { cuenta: this.documento(), tipo_persona: this.tipoPersona(), tipo_documento: this.tipoDocumento(), banco: this.banco() });
      if (m === 'tarjeta') {
        const [mes, anio] = this.vence().split('/');
        const numero = this.tarjetaNumero().replace(/\D/g, '');
        // El número va directo a Wompi; a MoviFY solo llegan el token y los últimos 4
        pedido.cuenta = await this.pagos.tokenTarjeta({ numero, mes, anio, cvc: this.cvc(), titular: this.titular().trim() });
        pedido.cuotas = this.cuotas();
        pedido.ultimos4 = numero.slice(-4);
        this.cvc.set('');
      }
      const r = await this.pagos.pagar(this.servicioId(), pedido);
      // PSE y Bancolombia: se abre la página del banco
      if (r.pago?.url_pago) window.open(r.pago.url_pago, '_blank', 'noopener');
      return r;
    });
  }

  async confirmarCodigo(): Promise<void> {
    await this.hacer(() => this.pagos.codigo(this.servicioId(), this.codigo()));
    this.codigo.set('');
  }

  async enEfectivo(): Promise<void> {
    await this.hacer(() => this.pagos.enEfectivo(this.servicioId()));
  }

  private async hacer(accion: () => Promise<EstadoPagoServicio>): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      this.aplicar(await accion());
    } catch (err) {
      this.error.set((err as ErrorApi).message || 'No pudimos procesar el pago. Intenta de nuevo.');
    } finally {
      this.ocupado.set(false);
    }
  }

  private async leer(): Promise<void> {
    try {
      this.aplicar(await this.pagos.estado(this.servicioId()));
    } catch {
      /* sin conexión: se reintenta en el próximo sondeo */
    }
  }

  private aplicar(p: EstadoPagoServicio): void {
    const primera = this.e() === null;
    this.e.set(p);
    if (primera && esDigital(p.metodo_pago)) {
      this.metodo.set(p.metodo_pago);
      if (p.metodo_pago === 'pse' && !this.bancosPedidos) {
        this.bancosPedidos = true;
        this.pagos.bancosPse().then((b) => this.bancos.set(b)).catch(() => undefined);
      }
    }
    const estado = p.pago?.estado ?? null;
    if (this.estadoAntes !== null && estado !== this.estadoAntes && estado === 'aprobado') {
      Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    }
    this.estadoAntes = estado;
  }
}
