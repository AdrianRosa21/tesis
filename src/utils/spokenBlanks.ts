import type { SpeechLang } from './language';

/**
 * Los puntos o guiones bajos repetidos de los exámenes ("............", "________") son espacios en blanco para
 * completar. Un motor de voz los trata como puntos finales: se detiene en cada uno (cuatro, ocho o dieciocho pausas
 * seguidas) o los lee como "punto punto". Tres puntos ("...") son unos puntos suspensivos normales y no se tocan.
 */
export const BLANK_RUN = /\.{4,}|_{3,}|…{2,}/g;

const BLANK_WORD: Record<SpeechLang, string> = { en: 'blank', es: 'espacio en blanco' };

/**
 * Misma longitud que `text`, pero con cada espacio en blanco convertido en guiones bajos. Sirve para cortar el texto
 * en frases sin que los puntos de un hueco ("Susan ........ eat meat.") cuenten como el fin de una frase.
 */
export function maskBlanks(text: string): string {
  return text.replace(BLANK_RUN, run => '_'.repeat(run.length));
}

export interface SpokenText {
  /** Lo que se le manda a la voz: cada espacio en blanco dicho con una palabra ("blank"). */
  spoken: string;
  /**
   * Convierte una posición del texto hablado (la que informa el evento "boundary" de la voz) en la del texto original,
   * para que el resaltado caiga donde está la palabra en pantalla. Un hueco se resalta completo.
   */
  toOriginal: (index: number, length: number) => { start: number; length: number };
}

interface Segment {
  spokenStart: number;
  spokenLength: number;
  originalStart: number;
  /** Largo del hueco en el texto original; solo en los tramos que se reemplazaron. */
  blankLength?: number;
}

export function speakableText(text: string, lang: SpeechLang): SpokenText {
  const runs = [...text.matchAll(BLANK_RUN)];
  if (runs.length === 0) return { spoken: text, toOriginal: (index, length) => ({ start: index, length }) };

  const segments: Segment[] = [];
  let spoken = '';
  let cursor = 0;

  for (const run of runs) {
    const start = run.index;
    const end = start + run[0].length;

    if (start > cursor) {
      segments.push({ spokenStart: spoken.length, spokenLength: start - cursor, originalStart: cursor });
      spoken += text.slice(cursor, start);
    }

    // Espacios solo donde hacen falta: "Susan ........ eat" -> "Susan blank eat", pero "no....a" -> "no blank a".
    const lead = start > 0 && !/\s/.test(text[start - 1]) ? ' ' : '';
    const trail = end < text.length && !/\s/.test(text[end]) ? ' ' : '';
    const word = `${lead}${BLANK_WORD[lang]}${trail}`;
    segments.push({ spokenStart: spoken.length, spokenLength: word.length, originalStart: start, blankLength: run[0].length });
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
    if (segment.blankLength !== undefined) return { start: segment.originalStart, length: segment.blankLength };
    return { start: segment.originalStart + (index - segment.spokenStart), length };
  };

  return { spoken, toOriginal };
}
