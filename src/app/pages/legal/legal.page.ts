import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { HeroCieloComponent } from '../../componentes/hero-cielo/hero-cielo.component';
import { DOCUMENTOS_LEGALES, DocumentoLegal, RESPONSABLE, TipoLegal } from '../../legal/contenido-legal';

/**
 * Términos y condiciones (/terminos) y Política de privacidad (/privacidad).
 * Una sola pantalla: el documento llega por la ruta → data: { tipo: 'terminos' | 'privacidad' }.
 * Es pública: se puede leer sin iniciar sesión (antes de aceptar en el registro).
 */
@Component({
  selector: 'app-legal',
  templateUrl: 'legal.page.html',
  styleUrls: ['legal.page.scss'],
  imports: [IonContent, HeroCieloComponent],
})
export class LegalPage {
  private readonly ruta = inject(ActivatedRoute);
  private readonly nav = inject(NavController);
  private readonly contenido = viewChild.required(IonContent);
  private readonly cuerpo = viewChild.required<ElementRef<HTMLElement>>('cuerpo');

  readonly doc: DocumentoLegal = DOCUMENTOS_LEGALES[(this.ruta.snapshot.data['tipo'] as TipoLegal) ?? 'terminos'];
  readonly otro: DocumentoLegal = DOCUMENTOS_LEGALES[this.doc.tipo === 'terminos' ? 'privacidad' : 'terminos'];
  readonly correo = RESPONSABLE.correo;

  /** Baja hasta la sección elegida en el índice. */
  irA(id: string): void {
    const el = this.cuerpo().nativeElement.querySelector<HTMLElement>(`#${id}`);
    if (el) this.contenido().scrollToPoint(0, el.offsetTop - 12, 350);
  }

  arriba(): void {
    this.contenido().scrollToTop(350);
  }

  verOtro(): void {
    this.nav.navigateForward('/' + this.otro.tipo);
  }
}
