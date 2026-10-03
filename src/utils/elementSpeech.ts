import type { PageElement } from './ai';
import { type SpeechLang, detectLanguage, normalizeLang } from './language';

// Tipos que AURA lee sin anunciar su nombre, para que el texto corrido suene natural.
const SILENT_TYPES = new Set(['párrafo', 'parrafo', 'texto', 'paragraph']);

const TYPE_LABELS: Record<SpeechLang, Record<string, string>> = {
  es: {},
  en: {
    tabla: 'Table',
    'descripción visual': 'Visual description',
    'contenido dudoso': 'Uncertain content',
  },
};

// Las descripciones visuales las escribe la IA en espanol aunque el documento
// este en otro idioma; el resto del contenido conserva su idioma original.
function isVisualDescription(type: string): boolean {
  return type.toLowerCase().startsWith('descripci');
}

/**
 * Idioma de la voz para un bloque. El TEXTO manda sobre la etiqueta del modelo: si el modelo dice "ingles" pero el
 * texto es claramente espanol (o al reves), se lee con la voz del texto. La etiqueta solo decide cuando el texto
 * es demasiado corto o ambiguo para saberlo ("Table 5", "1250"); y si no hay etiqueta, el idioma de la pagina.
 */
export function resolveElementLang(element: PageElement, fallback: SpeechLang = 'es'): SpeechLang {
  const declared = normalizeLang(element.lang);
  if (isVisualDescription(element.type)) return declared ?? 'es';
  return detectLanguage(element.content) ?? declared ?? fallback;
}

export interface SpokenElement {
  text: string;
  lang: SpeechLang;
}

export function buildSpokenElement(element: PageElement, fallback: SpeechLang = 'es'): SpokenElement {
  const lang = resolveElementLang(element, fallback);
  const typeLower = element.type.toLowerCase();

  let prefix = '';
  if (!SILENT_TYPES.has(typeLower)) {
    const label = TYPE_LABELS[lang][typeLower]
      ?? element.type.charAt(0).toUpperCase() + element.type.slice(1);
    prefix = `${label}: `;
  }

  return { text: `${prefix}${element.content}`, lang };
}

/** Idioma predominante de la pagina: sirve de respaldo para bloques cortos o ambiguos. */
export function pageLanguage(elements: PageElement[]): SpeechLang {
  let es = 0;
  let en = 0;
  for (const element of elements) {
    if (isVisualDescription(element.type)) continue;
    const lang = detectLanguage(element.content) ?? normalizeLang(element.lang);
    const weight = element.content.length;
    if (lang === 'es') es += weight;
    if (lang === 'en') en += weight;
  }
  return en > es ? 'en' : 'es';
}
