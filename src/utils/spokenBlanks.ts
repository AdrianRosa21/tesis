import type { SpeechLang } from './language';

/**
 * Los puntos o guiones bajos repetidos de los exámenes ("............", "________") son espacios en blanco para
 * completar. Un motor de voz los trata como puntos finales: se detiene en cada uno (cuatro, ocho o dieciocho pausas
 * seguidas) o los lee como "punto punto". Tres puntos ("...") son unos puntos suspensivos normales y no se tocan.
 */
export const BLANK_RUN = /\.{4,}|_{3,}|…{2,}/g;

const BLANK_WORD: Record<SpeechLang, string> = { en: 'blank', es: 'espacio en blanco' };

/**
 * Montos con "$" ("$ 625.00", "US$ 1,875.00", "$5 millones"). Las voces en español de Windows y Chrome suelen ser
 * mexicanas y leen "$" como "pesos"; aquí se dicen como "dólares" para que el monto no cambie de moneda al escucharlo.
 * Solo se tocan los montos claros: "MX$ 100", "$5M" o "$1.875" (con punto de miles) se dejan como están.
 */
const MONEY_RUN = new RegExp(
  String.raw`(?<![\p{L}\d])(?:US)?\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d|[.,]\d)` +
    String.raw`(?:\s+(mil|millón|millones|billón|billones)(?!\p{L}))?(?!\s?(?:[kmb]\b|million|billion|thousand))`,
  'giu',
);

function spokenMoney(whole: string, cents: string | undefined, magnitude: string | undefined): string {
  const digits = whole.replace(/,/g, '');
  if (magnitude) {
    const amount = cents ? `${digits}.${cents}` : digits;
    const word = magnitude.toLowerCase();
    return word === 'mil' ? `${amount} mil dólares` : `${amount} ${word} de dólares`;
  }
  const dollars = `${digits} ${digits === '1' ? 'dólar' : 'dólares'}`;
  const centavos = cents ? Number(cents.padEnd(2, '0')) : 0;
  if (centavos === 0) return dollars;
  return `${dollars} con ${centavos} ${centavos === 1 ? 'centavo' : 'centavos'}`;
}

interface Replacement {
  start: number;
  end: number;
  spoken: string;
}

function findReplacements(text: string, lang: SpeechLang): Replacement[] {
  const found: Replacement[] = [];

  for (const run of text.matchAll(BLANK_RUN)) {
    const start = run.index;
    const end = start + run[0].length;
    // Espacios solo donde hacen falta: "Susan ........ eat" -> "Susan blank eat", pero "no....a" -> "no blank a".
    const lead = start > 0 && !/\s/.test(text[start - 1]) ? ' ' : '';
    const trail = end < text.length && !/\s/.test(text[end]) ? ' ' : '';
    found.push({ start, end, spoken: `${lead}${BLANK_WORD[lang]}${trail}` });
  }

  // En inglés las voces ya dicen "dollars" solas.
  if (lang === 'es') {
    for (const money of text.matchAll(MONEY_RUN)) {
      const start = money.index;
      found.push({ start, end: start + money[0].length, spoken: spokenMoney(money[1], money[2], money[3]) });
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

/**
 * Misma longitud que `text`, pero con cada espacio en blanco convertido en guiones bajos. Sirve para cortar el texto
 * en frases sin que los puntos de un hueco ("Susan ........ eat meat.") cuenten como el fin de una frase.
 */
export function maskBlanks(text: string): string {
  return text.replace(BLANK_RUN, run => '_'.repeat(run.length));
}

export interface SpokenText {
  /** Lo que se le manda a la voz: cada espacio en blanco dicho con una palabra ("blank") y los "$" como "dólares". */
  spoken: string;
  /**
   * Convierte una posición del texto hablado (la que informa el evento "boundary" de la voz) en la del texto original,
   * para que el resaltado caiga donde está la palabra en pantalla. Un hueco o un monto se resaltan completos.
   */
  toOriginal: (index: number, length: number) => { start: number; length: number };
}

interface Segment {
  spokenStart: number;
  spokenLength: number;
  originalStart: number;
  /** Largo del tramo en el texto original; solo en los tramos que se reemplazaron (un hueco o un monto). */
  replacedLength?: number;
}

export function speakableText(text: string, lang: SpeechLang): SpokenText {
  const replacements = findReplacements(text, lang);
  if (replacements.length === 0) return { spoken: text, toOriginal: (index, length) => ({ start: index, length }) };

  const segments: Segment[] = [];
  let spoken = '';
  let cursor = 0;

  for (const { start, end, spoken: word } of replacements) {
    if (start < cursor) continue;

    if (start > cursor) {
      segments.push({ spokenStart: spoken.length, spokenLength: start - cursor, originalStart: cursor });
      spoken += text.slice(cursor, start);
    }

    segments.push({ spokenStart: spoken.length, spokenLength: word.length, originalStart: start, replacedLength: end - start });
    spoken += word;
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ spokenStart: spoken.length, spokenLength: text.length - cursor, originalStart: cursor });
    spoken += text.slice(cursor);
  }

  const toOriginal = (index: number, length: number) => {
    const segment = segments.find(item => index >= item.spokenStart && index < item.spokenStart + item.spokenLength);
    if (!segment) return { start: index, length };
    if (segment.replacedLength !== undefined) return { start: segment.originalStart, length: segment.replacedLength };
    return { start: segment.originalStart + (index - segment.spokenStart), length };
  };

  return { spoken, toOriginal };
}
