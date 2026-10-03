import { afterEach, describe, expect, it } from 'vitest';
import { chooseEnglishSource, describeEnglishSource, loadVoicePreference } from './voiceSource';

function voice(lang: string, name = lang): SpeechSynthesisVoice {
  return { lang, name, default: false, localService: true, voiceURI: lang } as SpeechSynthesisVoice;
}

const SPANISH_ONLY = [voice('es-MX'), voice('es-ES')];
const WITH_ENGLISH = [voice('es-MX'), voice('en-US', 'Microsoft Zira')];

describe('chooseEnglishSource', () => {
  it('con una voz en ingles en el navegador usa esa', () => {
    expect(chooseEnglishSource(WITH_ENGLISH, true)).toEqual({ kind: 'browser', name: 'Microsoft Zira' });
  });

  it('sin voz en ingles en el navegador usa la del servidor (antes leia el ingles con acento español)', () => {
    expect(chooseEnglishSource(SPANISH_ONLY, true)).toEqual({ kind: 'server' });
  });

  it('sin voz en ingles y sin servidor no hay voz, y asi se avisa en vez de callar el problema', () => {
    expect(chooseEnglishSource(SPANISH_ONLY, false)).toEqual({ kind: 'none' });
  });

  it('sin ninguna voz cargada todavia usa el servidor', () => {
    expect(chooseEnglishSource([], true)).toEqual({ kind: 'server' });
  });

  it('forzar el servidor lo prefiere aunque el navegador tenga voz', () => {
    expect(chooseEnglishSource(WITH_ENGLISH, true, 'server')).toEqual({ kind: 'server' });
  });

  it('forzar el servidor sin servidor vuelve al navegador', () => {
    expect(chooseEnglishSource(WITH_ENGLISH, false, 'server')).toEqual({ kind: 'browser', name: 'Microsoft Zira' });
  });

  it('forzar el navegador sin voz en ingles aun asi usa el servidor antes que leer ingles en español', () => {
    expect(chooseEnglishSource(SPANISH_ONLY, true, 'browser')).toEqual({ kind: 'server' });
  });

  it('acepta voces de otras regiones del ingles (no solo en-US)', () => {
    expect(chooseEnglishSource([voice('en-GB', 'Hazel')], true)).toEqual({ kind: 'browser', name: 'Hazel' });
  });
});

describe('describeEnglishSource', () => {
  it('lo dice en palabras', () => {
    expect(describeEnglishSource({ kind: 'server' })).toBe('voz estadounidense del servidor');
    expect(describeEnglishSource({ kind: 'browser', name: 'Zira' })).toBe('voz del navegador (Zira)');
    expect(describeEnglishSource({ kind: 'none' })).toBe('no hay voz en inglés disponible');
  });
});

describe('loadVoicePreference', () => {
  afterEach(() => localStorage.clear());

  it('por defecto es automatica y solo acepta valores validos', () => {
    expect(loadVoicePreference()).toBe('auto');
    localStorage.setItem('aura_voice_en', 'server');
    expect(loadVoicePreference()).toBe('server');
    localStorage.setItem('aura_voice_en', 'cualquier-cosa');
    expect(loadVoicePreference()).toBe('auto');
  });
});
