import { useCallback, useState } from 'react';
import type { SpeechApi } from './useSpeech';
import type { PageElement } from '../utils/ai';
import { buildSpokenElement, pageLanguage } from '../utils/elementSpeech';

const START_OF_PAGE = -1;
const END_MESSAGE = 'Fin de la página.';
const START_MESSAGE = 'Inicio de la página.';

/**
 * Recorre los elementos de una pagina (parrafos, tablas, descripciones...) con las
 * flechas. El indice -1 es "inicio de la pagina" y `elements.length` es "fin".
 */
export function useReadingNavigation(speech: Pick<SpeechApi, 'speak'>) {
  const { speak } = speech;
  const [index, setIndex] = useState(0);
  const [readingText, setReadingText] = useState('');

  const say = useCallback((text: string) => {
    setReadingText(text);
    speak(text, { lang: 'es' });
  }, [speak]);

  const readAt = useCallback((elements: PageElement[], position: number) => {
    if (position < 0 || position >= elements.length) return;
    const spoken = buildSpokenElement(elements[position], pageLanguage(elements));
    setReadingText(spoken.text);
    speak(spoken.text, { lang: spoken.lang });
  }, [speak]);

  const reset = useCallback(() => {
    setIndex(0);
    setReadingText('');
  }, []);

  const start = useCallback((elements: PageElement[]) => {
    setIndex(0);
    readAt(elements, 0);
  }, [readAt]);

  const next = useCallback((elements: PageElement[]) => {
    if (index < elements.length - 1) {
      const target = index + 1;
      setIndex(target);
      readAt(elements, target);
    } else if (index === elements.length - 1) {
      setIndex(elements.length);
      say(END_MESSAGE);
    }
  }, [index, readAt, say]);

  const previous = useCallback((elements: PageElement[]) => {
    if (index > 0 && index <= elements.length - 1) {
      setIndex(index - 1);
      readAt(elements, index - 1);
    } else if (index === elements.length) {
      // Estabamos en "Fin de la página": volvemos al último elemento.
      setIndex(elements.length - 1);
      readAt(elements, elements.length - 1);
    } else {
      setIndex(START_OF_PAGE);
      say(START_MESSAGE);
    }
  }, [index, readAt, say]);

  const repeat = useCallback((elements: PageElement[]) => {
    if (index >= 0 && index < elements.length) readAt(elements, index);
    else if (index === elements.length) speak(END_MESSAGE, { lang: 'es' });
    else speak(START_MESSAGE, { lang: 'es' });
  }, [index, readAt, speak]);

  return { index, readingText, reset, start, next, previous, repeat };
}
