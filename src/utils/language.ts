// Deteccion de idioma sin dependencias: cuenta palabras funcionales frecuentes
// de cada idioma. Sirve para elegir la voz correcta al leer un bloque de texto.
export type SpeechLang = 'es' | 'en';

const SPANISH_WORDS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'unos', 'unas',
  'es', 'fue', 'ser', 'por', 'con', 'para', 'se', 'su', 'sus', 'lo', 'al', 'como', 'más',
  'pero', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'entre', 'sobre', 'también',
  'muy', 'hay', 'ya', 'cuando', 'donde', 'porque', 'son', 'nos', 'les', 'sin',
]);

const ENGLISH_WORDS = new Set([
  'the', 'and', 'of', 'to', 'in', 'is', 'that', 'it', 'for', 'with', 'as', 'was', 'on',
  'are', 'be', 'this', 'by', 'at', 'from', 'or', 'an', 'have', 'not', 'but', 'they',
  'his', 'her', 'their', 'which', 'were', 'has', 'had', 'you', 'your', 'we', 'our',
  'can', 'will', 'would', 'there', 'been', 'these', 'those', 'than', 'then', 'also',
  'more', 'other', 'into', 'its', 'what', 'when', 'who',
]);

const MIN_WORDS = 3;
const MIN_MARGIN = 0.25;

export function detectLanguage(text: string): SpeechLang | null {
  const words = text.toLowerCase().match(/[a-záéíóúüñ]+/g);
  if (!words || words.length < MIN_WORDS) return null;

  let es = 0;
  let en = 0;
  for (const word of words) {
    if (SPANISH_WORDS.has(word)) es += 1;
    if (ENGLISH_WORDS.has(word)) en += 1;
  }
  es += (text.match(/[ñ¿¡áéíóú]/gi) || []).length * 0.5;

  const total = es + en;
  if (total === 0) return null;
  if (Math.abs(es - en) / total < MIN_MARGIN) return null;
  return es > en ? 'es' : 'en';
}

export function normalizeLang(code: string | null | undefined): SpeechLang | null {
  const base = (code || '').toLowerCase().split(/[-_]/)[0];
  return base === 'es' || base === 'en' ? base : null;
}

const FALLBACK_TAG: Record<SpeechLang, string> = { es: 'es-MX', en: 'en-US' };

// Regiones preferidas por idioma, de mejor a peor. La primera es la del navegador del usuario.
function preferredRegions(lang: SpeechLang, navigatorLang: string): string[] {
  const own = navigatorLang.toLowerCase().replace('_', '-');
  const defaults = lang === 'es' ? ['es-mx', 'es-es', 'es-us'] : ['en-us', 'en-gb'];
  return own.startsWith(lang) ? [own, ...defaults] : defaults;
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: SpeechLang,
  navigatorLang = '',
): SpeechSynthesisVoice | null {
  const matches = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  if (matches.length === 0) return null;

  const regions = preferredRegions(lang, navigatorLang);
  const rank = (voice: SpeechSynthesisVoice): number => {
    const tag = voice.lang.toLowerCase().replace('_', '-');
    const index = regions.indexOf(tag);
    return index === -1 ? regions.length : index;
  };

  return [...matches].sort((a, b) => rank(a) - rank(b) || Number(b.default) - Number(a.default))[0];
}

export function fallbackLanguageTag(lang: SpeechLang): string {
  return FALLBACK_TAG[lang];
}
