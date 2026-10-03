import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpeech } from './useSpeech';

// El servidor de voz se simula: aqui se prueba el hook, no la red.
const mocks = vi.hoisted(() => ({
  state: { available: true },
  check: vi.fn(),
  getAudioUrl: vi.fn(),
  prefetch: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock('../utils/serverVoice', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/serverVoice')>();
  return {
    ...original,
    serverVoice: {
      get available() {
        return mocks.state.available;
      },
      check: mocks.check,
      getAudioUrl: mocks.getAudioUrl,
      prefetch: mocks.prefetch,
      markFailed: mocks.markFailed,
    },
  };
});

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

class FakeAudio {
  static instances: FakeAudio[] = [];
  src = '';
  playbackRate = 1;
  preservesPitch = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  /** Lo que hace play(): por defecto suena; una prueba puede hacer que el navegador lo rechace. */
  static playResult: () => Promise<void> = () => Promise.resolve();
  play = vi.fn(() => FakeAudio.playResult());
  pause = vi.fn();
  constructor() {
    FakeAudio.instances.push(this);
  }
}

function voice(lang: string) {
  return { lang, name: lang, default: false, localService: true, voiceURI: lang };
}

const ENGLISH = 'The kid was so fast that no one saw him. Option a is so.';

let queued: FakeUtterance[];
let voices: ReturnType<typeof voice>[];
let synth: {
  paused: boolean;
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  getVoices: () => ReturnType<typeof voice>[];
};

const audio = () => FakeAudio.instances[0];

beforeEach(() => {
  localStorage.clear();
  queued = [];
  voices = [voice('es-MX')]; // sin ninguna voz en ingles: el caso que se queja de "leer ingles con voz en español"
  synth = {
    paused: false,
    speak: vi.fn((u: FakeUtterance) => queued.push(u)),
    cancel: vi.fn(() => {
      queued = [];
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => voices,
  };
  FakeAudio.instances = [];
  FakeAudio.playResult = () => Promise.resolve();
  mocks.state.available = true;
  mocks.check.mockReset().mockResolvedValue(true);
  mocks.getAudioUrl.mockReset().mockImplementation((text: string) => Promise.resolve(`blob:${text}`));
  mocks.prefetch.mockReset();
  mocks.markFailed.mockReset().mockImplementation(() => {
    mocks.state.available = false;
  });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function speakEnglish(result: { current: ReturnType<typeof useSpeech> }, text = ENGLISH, onEnd?: () => void) {
  await act(async () => {
    result.current.speak(text, { lang: 'en', onEnd });
  });
}

describe('useSpeech con la voz del servidor', () => {
  it('sin voz en ingles en el navegador, lee el ingles con el audio del servidor', async () => {
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    expect(queued).toHaveLength(0); // no se uso la voz del navegador
    expect(mocks.getAudioUrl).toHaveBeenCalledWith('The kid was so fast that no one saw him.');
    expect(audio().src).toBe('blob:The kid was so fast that no one saw him.');
    expect(audio().play).toHaveBeenCalledTimes(1);
    expect(result.current.isSpeaking).toBe(true);
  });

  it('indica en pantalla que la ultima frase salio de la voz del servidor', async () => {
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    expect(result.current.lastVoice).toBe('inglés · voz del servidor (Piper)');
  });

  it('va frase por frase, descarga la siguiente mientras suena la actual y avisa al terminar', async () => {
    const onEnd = vi.fn();
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result, ENGLISH, onEnd);

    expect(mocks.prefetch).toHaveBeenCalledWith(' Option a is so.'.trim());

    await act(async () => audio().onended?.());
    expect(mocks.getAudioUrl).toHaveBeenLastCalledWith('Option a is so.');
    expect(onEnd).not.toHaveBeenCalled();

    await act(async () => audio().onended?.());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(result.current.isSpeaking).toBe(false);
  });

  it('resalta la frase completa (el audio no avisa palabra por palabra)', async () => {
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    expect(result.current.highlight).toEqual({ start: 0, length: 'The kid was so fast that no one saw him.'.length });
  });

  it('con una voz en ingles en el navegador usa esa y no toca el servidor', async () => {
    voices = [voice('es-MX'), voice('en-US')];
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    expect(queued[0].voice?.lang).toBe('en-US');
    expect(mocks.getAudioUrl).not.toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('el espanol nunca usa la voz del servidor', async () => {
    const { result } = renderHook(() => useSpeech());
    await act(async () => result.current.speak('Hola mundo, esta es una prueba.', { lang: 'es' }));

    expect(mocks.getAudioUrl).not.toHaveBeenCalled();
    expect(queued[0].voice?.lang).toBe('es-MX');
  });

  it('si el servidor no esta disponible, usa el navegador como antes', async () => {
    mocks.state.available = false;
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    expect(queued[0].text).toBe('The kid was so fast that no one saw him.');
    expect(mocks.getAudioUrl).not.toHaveBeenCalled();
  });

  it('si el servidor falla, esa misma frase se lee con el navegador y no se vuelve a intentar', async () => {
    mocks.getAudioUrl.mockRejectedValueOnce(new Error('caido'));
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
    expect(queued.map((u) => u.text)).toEqual(['The kid was so fast that no one saw him.']);

    await act(async () => queued[0].onend?.());
    expect(queued[1].text).toBe(' Option a is so.'); // el resto sigue con el navegador
    expect(mocks.getAudioUrl).toHaveBeenCalledTimes(1);
  });

  it('si el navegador rechaza reproducir el audio, cae a la voz del navegador', async () => {
    FakeAudio.playResult = () => Promise.reject(new Error('NotAllowedError'));
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    expect(queued[0]?.text).toBe('The kid was so fast that no one saw him.');
    expect(mocks.markFailed).toHaveBeenCalled();
  });

  it('cambiar la velocidad mientras suena el audio la aplica al instante, sin repetir la frase', async () => {
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);
    synth.cancel.mockClear();

    await act(async () => {
      result.current.setRate(1.5);
    });

    expect(audio().playbackRate).toBe(1.5);
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(audio().preservesPitch).toBe(true); // mas rapido sin voz de ardilla
  });

  it('la frase siguiente arranca con la velocidad que quedo guardada', async () => {
    localStorage.setItem('aura_speech_rate', '1.3');
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    expect(audio().playbackRate).toBe(1.3);
  });

  it('pausar y continuar pausan el audio, no la voz del navegador', async () => {
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    act(() => result.current.pause());
    expect(audio().pause).toHaveBeenCalled();
    expect(synth.pause).not.toHaveBeenCalled();
    expect(result.current.isPaused).toBe(true);

    act(() => result.current.resume());
    expect(audio().play).toHaveBeenCalledTimes(2);
    expect(synth.resume).not.toHaveBeenCalled();
    expect(result.current.isPaused).toBe(false);
  });

  it('si se pausa mientras la frase todavia se descarga, no suena hasta continuar', async () => {
    let finishDownload: (url: string) => void = () => undefined;
    mocks.getAudioUrl.mockImplementationOnce(() => new Promise<string>((resolve) => { finishDownload = resolve; }));
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    act(() => result.current.pause());
    await act(async () => finishDownload('blob:lista'));
    expect(FakeAudio.instances[0].play).not.toHaveBeenCalled();

    act(() => result.current.resume());
    expect(audio().src).toBe('blob:lista');
    expect(audio().play).toHaveBeenCalledTimes(1);
  });

  it('detener durante la descarga cancela la frase: no suena nada despues', async () => {
    let finishDownload: (url: string) => void = () => undefined;
    mocks.getAudioUrl.mockImplementationOnce(() => new Promise<string>((resolve) => { finishDownload = resolve; }));
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);

    act(() => result.current.stop());
    await act(async () => finishDownload('blob:tarde'));

    expect(FakeAudio.instances).toHaveLength(0);
    expect(result.current.isSpeaking).toBe(false);
  });

  it('empezar otra lectura corta la anterior: el audio viejo ya no avanza', async () => {
    const { result } = renderHook(() => useSpeech());
    await speakEnglish(result);
    const first = audio();

    await speakEnglish(result, 'A completely different sentence about the weather.');
    await act(async () => first.onended?.()); // evento tardio de la lectura anterior

    expect(mocks.getAudioUrl).not.toHaveBeenCalledWith('Option a is so.');
  });

  it('dice de donde sale la voz en ingles', async () => {
    const { result, rerender } = renderHook(() => useSpeech());
    await act(async () => undefined);
    expect(result.current.englishVoice).toBe('voz estadounidense del servidor');

    voices = [voice('es-MX'), voice('en-US')];
    synth.getVoices = () => voices;
    mocks.state.available = false;
    const second = renderHook(() => useSpeech());
    rerender();
    expect(second.result.current.englishVoice).toBe('voz del navegador (en-US)');
  });
});
