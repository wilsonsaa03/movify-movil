import { contenidoProhibido } from './contenido-prohibido';

/** Mismos casos que ContenidoProhibidoTest.java: si fallan, las dos listas se separaron. */
describe('contenidoProhibido', () => {
  it.each([
    'Una caja de zapatos con ropa',
    'Documentos de la notaría',
    'Almuerzo: arroz, pescado y una Coca-Cola',
    'Huevos pericos para el desayuno',
    'Un machete nuevo para la finca',
    'Pistola de silicona y barras',
    'Cartuchos de tinta para la impresora',
    'Granadas y granadillas del mercado',
    'Papeles para la señora Hurtado',
    'Repuestos de moto',
    'Comprobante de pago',
    'Medicamentos de la droguería',
  ])('deja pasar "%s"', (texto) => {
    expect(contenidoProhibido(texto)).toBeNull();
  });

  it('detecta drogas, armas, municiones, explosivos, dinero y robados', () => {
    expect(contenidoProhibido('Un paquete de marihuana')).toBe('drogas');
    expect(contenidoProhibido('100 gramos de COCAÍNA')).toBe('drogas');
    expect(contenidoProhibido('una pistola 9 mm')).toBe('armas');
    expect(contenidoProhibido('caja de balas')).toBe('municiones');
    expect(contenidoProhibido('pólvora para diciembre')).toBe('explosivos');
    expect(contenidoProhibido('Sobre con dinero')).toBe('dinero en efectivo');
    expect(contenidoProhibido('celular robado')).toBe('objetos robados o de contrabando');
  });

  it('no se engaña con trucos simples', () => {
    expect(contenidoProhibido('c0ca1na')).toBe('drogas');
    expect(contenidoProhibido('m.a.r.i.h.u.a.n.a')).toBe('drogas');
    expect(contenidoProhibido('P I S T O L A')).toBe('armas');
  });
});
