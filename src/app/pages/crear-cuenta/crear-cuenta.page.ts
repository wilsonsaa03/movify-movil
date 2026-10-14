import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { HeroCieloComponent } from '../../componentes/hero-cielo/hero-cielo.component';
import { RegistroService, type Rol } from '../../servicios/registro.service';

interface OpcionRol {
  id: Rol;
  etiqueta: string;
  titulo: string;
  detalle: string;
}

@Component({
  selector: 'app-crear-cuenta',
  templateUrl: 'crear-cuenta.page.html',
  styleUrls: ['crear-cuenta.page.scss'],
  imports: [IonContent, HeroCieloComponent],
})
export class CrearCuentaPage {
  private readonly router = inject(Router);
  private readonly registro = inject(RegistroService);

  readonly opciones: OpcionRol[] = [
    { id: 'cliente', etiqueta: 'Cliente', titulo: 'Quiero viajar', detalle: 'Pide taxi, moto, domicilios y encomiendas' },
    { id: 'conductor', etiqueta: 'Conductor', titulo: 'Quiero conducir', detalle: 'Gana dinero con tu taxi o tu moto' },
  ];

  readonly elegido = signal<Rol | null>(null);

  elegir(rol: Rol): void {
    if (this.elegido() !== rol) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    }
    this.elegido.set(rol);
  }

  /** Flechas arriba/abajo cambian la opción (comportamiento estándar de un grupo de radios). */
  alTeclado(e: KeyboardEvent, i: number): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const sig = (i + (e.key === 'ArrowDown' ? 1 : -1) + this.opciones.length) % this.opciones.length;
    this.elegir(this.opciones[sig].id);
    (document.getElementById(`rol-${this.opciones[sig].id}`) as HTMLElement | null)?.focus();
  }

  continuar(): void {
    const rol = this.elegido();
    if (!rol) return;
    this.registro.iniciar(rol);
    this.router.navigateByUrl('/registro/celular');
  }

  irALogin(): void {
    this.router.navigateByUrl('/login');
  }
}
