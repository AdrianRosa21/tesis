import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerVoice, cleanForServerVoice } from './serverVoice';

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

function audio(status = 200) {
  return Promise.resolve(new Response(new Blob(['RIFF']), { status, headers: { 'Content-Type': 'audio/wav' } }));
}

let fetchMock: ReturnType<typeof vi.fn>;
let created: string[];
let revoked: string[];

beforeEach(() => {
  fetchMock = vi.fn();
  created = [];
  revoked = [];
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', {
    createObjectURL: () => {
      const url = `blob:${created.length}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url: string) => revoked.push(url),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('cleanForServerVoice', () => {
  it('los puntos repetidos de un examen (espacio en blanco) se dicen "blank"', () => {
    expect(cleanForServerVoice('4. ............ adults know how to use the Internet.'))
      .toBe('4. blank adults know how to use the Internet.');
    expect(cleanForServerVoice('Name: ________')).toBe('Name: blank');
  });

  it('los puntos suspensivos normales no se tocan', () => {
    expect(cleanForServerVoice('Wait... what?')).toBe('Wait... what?');
  });

  it('junta espacios y saltos de linea', () => {
    expect(cleanForServerVoice('  Hello \n  there  ')).toBe('Hello there');
  });
});

describe('ServerVoice.check', () => {
  it('es true si el servidor dice que tiene voz en ingles, y solo pregunta una vez', async () => {
    fetchMock.mockImplementation(() => json({ available: true, languages: ['en'] }));
    const voice = new ServerVoice();

    expect(voice.available).toBe(false); // mientras no se sepa, no se usa
    expect(await voice.check()).toBe(true);
    expect(await voice.check()).toBe(true);

    expect(voice.available).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('varias consultas a la vez comparten una sola peticion', async () => {
    fetchMock.mockImplementation(() => json({ available: true, languages: ['en'] }));
    const voice = new ServerVoice();

    await Promise.all([voice.check(), voice.check(), voice.check()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('es false si el servidor no tiene la voz, responde con error o no contesta', async () => {
    for (const reply of [
      () => json({ available: false, languages: [] }),
      () => json({ detail: 'x' }, 503),
      () => Promise.reject(new Error('sin red')),
      () => json({ available: true, languages: ['fr'] }),
    ]) {
      fetchMock.mockImplementationOnce(reply);
      expect(await new ServerVoice().check()).toBe(false);
    }
  });

  it('tras un fallo no insiste durante un minuto y luego vuelve a preguntar', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('sin red')));
    fetchMock.mockImplementationOnce(() => json({ available: true, languages: ['en'] }));
    const voice = new ServerVoice();

    expect(await voice.check()).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(await voice.check()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(40_000);
    expect(await voice.check()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('markFailed apaga la voz del servidor de inmediato', async () => {
    fetchMock.mockImplementation(() => json({ available: true, languages: ['en'] }));
    const voice = new ServerVoice();
    await voice.check();

    voice.markFailed();

    expect(voice.available).toBe(false);
  });
});

describe('ServerVoice.getAudioUrl', () => {
  it('pide el audio de la frase con el idioma ingles', async () => {
    fetchMock.mockImplementation(() => audio());
    const voice = new ServerVoice();

    const url = await voice.getAudioUrl('Hello there.');

    expect(url).toBe('blob:0');
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toMatch(/\/api\/tts$/); // en desarrollo lleva el servidor delante; en produccion es relativa
    expect(JSON.parse(init.body)).toEqual({ text: 'Hello there.', lang: 'en' });
  });

  it('una misma frase se descarga una sola vez', async () => {
    fetchMock.mockImplementation(() => audio());
    const voice = new ServerVoice();

    const [a, b] = await Promise.all([voice.getAudioUrl('Hi.'), voice.getAudioUrl('Hi.')]);
    voice.prefetch('Hi.');

    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un error no se guarda: la siguiente vez se puede reintentar', async () => {
    fetchMock.mockImplementationOnce(() => audio(503));
    fetchMock.mockImplementationOnce(() => audio());
    const voice = new ServerVoice();

    await expect(voice.getAudioUrl('Hi.')).rejects.toThrow('503');
    await expect(voice.getAudioUrl('Hi.')).resolves.toBe('blob:0');
  });

  it('prefetch no lanza errores aunque el servidor falle', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('sin red')));
    const voice = new ServerVoice();

    voice.prefetch('Hi.');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('guarda un numero limitado de frases y libera la memoria de las viejas', async () => {
    fetchMock.mockImplementation(() => audio());
    const voice = new ServerVoice();

    for (let i = 0; i < 50; i++) await voice.getAudioUrl(`Sentence ${i}.`);
    await Promise.resolve();

    expect(revoked.length).toBe(10); // 50 pedidas, 40 guardadas
    expect(revoked[0]).toBe('blob:0'); // se descartan primero las mas viejas
  });

  it('clear libera todo', async () => {
    fetchMock.mockImplementation(() => audio());
    const voice = new ServerVoice();
    await voice.getAudioUrl('One.');
    await voice.getAudioUrl('Two.');

    voice.clear();
    await Promise.resolve();

    expect(revoked).toEqual(['blob:0', 'blob:1']);
  });
});
