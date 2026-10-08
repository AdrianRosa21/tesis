import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeech } from './useSpeech';

class FakeUtterance {
  text: string;
  rate = 1;
  lang = '';
  voice: { lang: string } | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onboundary: ((event: unknown) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function voice(lang: string) {
  return { lang, name: lang, default: false, localService: true, voiceURI: lang };
}

let queued: FakeUtterance[];
let synth: {
  paused: boolean;
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  getVoices: () => ReturnType<typeof voice>[];
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  queued = [];
  synth = {
    paused: false,
    speak: vi.fn((u: FakeUtterance) => queued.push(u)),
    cancel: vi.fn(() => {
      queued = [];
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [voice('es-MX'), voice('en-US')],
  };
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useSpeech', () => {
  it('lee oracion por oracion', () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak('Hola mundo. Adiós.'));

    expect(queued[0].text).toBe('Hola mundo.');
    act(() => queued[0].onend?.());
    expect(queued[1].text).toBe(' Adiós.');
  });

  describe('espacios en blanco de un examen ("........")', () => {
    const EXAM = '11. Susan ........ eat meat, but now she does.';

    it('los puntos del hueco no cortan la frase: se lee en dos frases, no en tres', () => {
      const { result } = renderHook(() => useSpeech());
      act(() => result.current.speak(EXAM, { lang: 'en' }));

      expect(queued[0].text).toBe('11.');
      act(() => queued[0].onend?.());
      expect(queued[1].text).toBe(' Susan blank eat meat, but now she does.');
      act(() => queued[1].onend?.());
      expect(queued).toHaveLength(2); // antes eran 3 frases: "11.", " Susan ........" y " eat meat, ..."
    });

    it('en espanol el hueco se dice "espacio en blanco"', () => {
      const { result } = renderHook(() => useSpeech());
      act(() => result.current.speak('Mi hermano ........ a la escuela.', { lang: 'es' }));

      expect(queued[0].text).toBe('Mi hermano espacio en blanco a la escuela.');
    });

    it('el resaltado sigue cayendo sobre la palabra correcta aunque el texto hablado sea distinto', () => {
      const { result } = renderHook(() => useSpeech());
      act(() => result.current.speak(EXAM, { lang: 'en' }));
      act(() => queued[0].onend?.());
      const spoken = queued[1].text;

      const wordAt = (word: string) => spoken.indexOf(word);
      const say = (word: string, length: number) =>
        act(() => queued[1].onboundary?.({ name: 'word', charIndex: wordAt(word), charLength: length }));

      say('Susan', 5);
      expect(EXAM.slice(result.current.highlight!.start, result.current.highlight!.start + result.current.highlight!.length)).toBe('Susan');

      say('blank', 5);
      expect(EXAM.slice(result.current.highlight!.start, result.current.highlight!.start + result.current.highlight!.length)).toBe('........');

      say('eat', 3);
      expect(EXAM.slice(result.current.highlight!.start, result.current.highlight!.start + result.current.highlight!.length)).toBe('eat');

      say('does', 4);
      expect(EXAM.slice(result.current.highlight!.start, result.current.highlight!.start + result.current.highlight!.length)).toBe('does');
    });

    it('los puntos suspensivos normales ("...") siguen leyendose como antes', () => {
      const { result } = renderHook(() => useSpeech());
      act(() => result.current.speak('Wait... what?', { lang: 'en' }));

      expect(queued[0].text).toBe('Wait...');
    });
  });

  it('usa una voz en ingles cuando el texto esta en ingles', () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak('The quick brown fox is on the table and it was fun.'));

    expect(queued[0].voice?.lang).toBe('en-US');
  });

  it('dice con que idioma y voz se leyo la ultima frase', () => {
    const { result } = renderHook(() => useSpeech());
    expect(result.current.lastVoice).toBe('');

    act(() => result.current.speak('Hola mundo, esta es una prueba.', { lang: 'es' }));
    expect(result.current.lastVoice).toBe('español · es-MX');

    act(() => result.current.speak('Table 5', { lang: 'en' }));
    expect(result.current.lastVoice).toBe('inglés · en-US');
  });

  it('usa voz en espanol por defecto y respeta el idioma indicado', () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak('1250'));
    expect(queued[0].voice?.lang).toBe('es-MX');

    act(() => result.current.speak('Table 5', { lang: 'en' }));
    expect(queued[0].voice?.lang).toBe('en-US');
  });

  it('aplica la velocidad guardada a cada frase', () => {
    localStorage.setItem('aura_speech_rate', '1.3');
    const { result } = renderHook(() => useSpeech());
    expect(result.current.rate).toBe(1.3);

    act(() => result.current.speak('Una frase. Otra frase.'));
    expect(queued[0].rate).toBe(1.3);
    act(() => queued[0].onend?.());
    expect(queued[1].rate).toBe(1.3);
  });

  it('adjustRate sube o baja de a 0.05 y lo recuerda', () => {
    const { result } = renderHook(() => useSpeech());

    act(() => {
      result.current.adjustRate(1);
    });
    expect(result.current.rate).toBe(1.05);
    act(() => {
      result.current.adjustRate(-2);
    });
    expect(result.current.rate).toBe(0.95);
    expect(localStorage.getItem('aura_speech_rate')).toBe('0.95');
  });

  it('al cambiar la velocidad repite la frase en curso con la velocidad nueva', () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak('Una frase larga. Otra frase.'));
    expect(queued[0].text).toBe('Una frase larga.');

    act(() => {
      result.current.setRate(1.25);
      vi.advanceTimersByTime(200);
    });

    expect(synth.cancel).toHaveBeenCalled();
    expect(queued).toHaveLength(1);
    expect(queued[0].text).toBe('Una frase larga.');
    expect(queued[0].rate).toBe(1.25);
  });

  it('cambiar la velocidad sin lectura en curso no dice nada', () => {
    const { result } = renderHook(() => useSpeech());
    act(() => {
      result.current.setRate(1.5);
      vi.advanceTimersByTime(500);
    });
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('announce no interrumpe la lectura', () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak('Una frase.'));
    synth.cancel.mockClear();

    act(() => result.current.announce('Velocidad 1.05'));
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(queued.map(u => u.text)).toEqual(['Una frase.', 'Velocidad 1.05']);
  });

  it('reintenta si la primera sintesis falla en frio', () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak('Hola.'));
    const first = queued[0];

    act(() => {
      first.onerror?.({ error: 'synthesis-failed' });
      vi.advanceTimersByTime(300);
    });
    expect(queued).toHaveLength(2);
    expect(queued[1].text).toBe('Hola.');
  });
});
