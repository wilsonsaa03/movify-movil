/** Lado mayor de las fotos que se suben (entrega, selfie): suficiente para verlas y ahorra datos móviles. */
const LADO_MAX = 1600;

/**
 * Reduce una foto de la cámara (5-10 MB) a JPEG de ~1600 px (unos 300 KB) antes de subirla.
 * Si el navegador no puede (formato raro, sin canvas), devuelve el archivo original.
 */
export async function reducirFoto(archivo: File, ladoMax = LADO_MAX): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || !archivo.type.startsWith('image/')) return archivo;
  try {
    const img = await createImageBitmap(archivo);
    const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
    if (escala === 1 && archivo.size < 1_500_000) {
      img.close();
      return archivo;
    }
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    const ctx = lienzo.getContext('2d');
    if (!ctx) return archivo;
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    img.close();
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.82));
    return blob && blob.size < archivo.size ? blob : archivo;
  } catch {
    return archivo;
  }
}
