/**
 * Aviso inmediato de contenido que MoviFY no transporta (drogas, armas, municiones, explosivos,
 * dinero en efectivo, objetos robados). Es una COPIA de la regla del backend
 * (comun/ContenidoProhibido.java), que es quien decide: si se cambia allá, se cambia aquí.
 */
const LISTA: Record<string, string[]> = {
  drogas: ['droga', 'drogas', 'cocaina', 'marihuana', 'mariguana', 'marijuana', 'cannabis', 'bareta', 'creepy', 'cripy',
    'porro', 'porros', 'bazuco', 'basuco', 'heroina', 'extasis', 'tusi', 'tussi', 'tucibi', '2cb', 'lsd', 'metanfetamina',
    'anfetamina', 'fentanilo', 'crack', 'hachis', 'pasta base', 'hoja de coca', 'estupefaciente', 'estupefacientes',
    'sustancia ilegal', 'sustancias ilegales', 'sustancia prohibida', 'sustancias prohibidas'],
  armas: ['arma', 'armas', 'arma de fuego', 'pistola', 'pistolas', 'revolver', 'revolveres', 'fusil', 'fusiles', 'escopeta',
    'escopetas', 'rifle', 'rifles', 'subametralladora', 'ametralladora', 'changon', 'trabuco', 'silenciador'],
  municiones: ['municion', 'municiones', 'bala', 'balas', 'proyectil', 'proyectiles'],
  explosivos: ['explosivo', 'explosivos', 'granada de mano', 'granadas de mano', 'dinamita', 'detonador', 'detonadores',
    'polvora', 'c4', 'anfo', 'mina antipersona', 'minas antipersona'],
  'dinero en efectivo': ['dinero', 'dinero en efectivo', 'billetes', 'fajo de billetes', 'fajos de billetes', 'dolares',
    'plata en efectivo'],
  'objetos robados o de contrabando': ['robado', 'robada', 'robados', 'robadas', 'mercancia hurtada', 'objeto hurtado',
    'objetos hurtados', 'contrabando'],
};

/** Usos legales que contienen una palabra de la lista. */
const PERMITIDOS = ['pistola de silicona', 'pistola de calor', 'pistola de agua', 'pistola de juguete', 'pistolas de juguete',
  'arma de juguete', 'armas de juguete', 'pistola de pintura', 'pistola para pintar', 'pistola de aire para inflar',
  'pistola de riego'];

const DISFRAZ: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's' };

function normalizar(texto: string): string {
  const s = texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const entreLetras = i > 0 && i < s.length - 1 && /\p{L}/u.test(s[i - 1]) && /\p{L}/u.test(s[i + 1]);
    if (DISFRAZ[c] && entreLetras) r += DISFRAZ[c];
    else if (c === '@') r += 'a';
    else if (c === '$') r += 's';
    else r += /[\p{L}\p{N}]/u.test(c) ? c : ' ';
  }
  return r.replace(/\s+/g, ' ').trim();
}

/** La categoría prohibida que menciona el texto ("drogas", "armas"…), o null si está bien. */
export function contenidoProhibido(texto: string | null | undefined): string | null {
  if (!texto?.trim()) return null;
  let t = ` ${normalizar(texto)} `;
  for (const p of PERMITIDOS) t = t.replaceAll(` ${p} `, ' ');
  const pegado = ` ${t.replaceAll(' ', '')} `;
  for (const [categoria, palabras] of Object.entries(LISTA)) {
    for (const p of palabras) {
      if (t.includes(` ${p} `)) return categoria;
      if (p.length >= 6 && !p.includes(' ') && pegado.includes(p) && !t.includes(p)) return categoria;
    }
  }
  return null;
}
