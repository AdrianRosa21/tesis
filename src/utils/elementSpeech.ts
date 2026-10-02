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

export function resolveElementLang(element: PageElement, fallback: SpeechLang = 'es'): SpeechLang {
  const declared = normalizeLang(element.lang);
  if (declared) return declared;
  if (isVisualDescription(element.type)) return 'es';
  return detectLanguage(element.content) ?? fallback;
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
    const lang = normalizeLang(element.lang) ?? detectLanguage(element.content);
    const weight = element.content.length;
    if (lang === 'es') es += weight;
    if (lang === 'en') en += weight;
  }
  return en > es ? 'en' : 'es';
}
