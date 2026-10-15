import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { NavController } from '@ionic/angular';
import { DOCUMENTOS_LEGALES } from '../../legal/contenido-legal';
import { LegalPage } from './legal.page';

describe('LegalPage', () => {
  const crear = (tipo: string) => {
    TestBed.configureTestingModule({
      imports: [LegalPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { tipo } } } },
        { provide: NavController, useValue: { navigateForward: vi.fn(), back: vi.fn(), navigateBack: vi.fn() } },
      ],
    });
    const f = TestBed.createComponent(LegalPage);
    f.detectChanges();
    return f;
  };

  it('muestra los términos con todas sus secciones', () => {
    const el: HTMLElement = crear('terminos').nativeElement;
    expect(el.textContent).toContain('Términos y condiciones');
    expect(el.querySelectorAll('section.seccion').length).toBe(DOCUMENTOS_LEGALES.terminos.secciones.length);
  });

  it('muestra la política de privacidad y ofrece leer los términos', () => {
    const el: HTMLElement = crear('privacidad').nativeElement;
    expect(el.textContent).toContain('Ley 1581 de 2012');
    expect(el.textContent).toContain('Leer Términos y condiciones');
  });

  it('la versión coincide con la que acepta el registro en la base de datos (1.0)', () => {
    expect(DOCUMENTOS_LEGALES.terminos.version).toBe('1.0');
    expect(DOCUMENTOS_LEGALES.privacidad.version).toBe('1.0');
  });
});
