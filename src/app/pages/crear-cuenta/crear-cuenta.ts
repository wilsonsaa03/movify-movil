import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-crear-cuenta',
  templateUrl: './crear-cuenta.page.html',
  styleUrls: ['./crear-cuenta.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule],
})
export class CrearCuentaPage {
  private readonly router = inject(Router);

  // Estado que almacena el rol seleccionado: 'cliente' o 'conductor'
  readonly tipoSeleccionado = signal<'cliente' | 'conductor'>('cliente');

  seleccionarTipo(tipo: 'cliente' | 'conductor'): void {
    this.tipoSeleccionado.set(tipo);
  }

  volver(): void {
    this.router.navigateByUrl('/login');
  }

  continuar(): void {
    const rol = this.tipoSeleccionado();
    if (rol === 'cliente') {
      this.router.navigateByUrl('/registro-cliente');
    } else {
      this.router.navigateByUrl('/registro-conductor');
    }
  }

  irALogin(): void {
    this.router.navigateByUrl('/login');
  }
}