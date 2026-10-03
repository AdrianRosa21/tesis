import { pickVoice } from './language';

/** De dónde sale la voz que lee en inglés. */
export type EnglishVoiceSource =
  | { kind: 'browser'; name: string }
  | { kind: 'server' }
  | { kind: 'none' };

/** auto = la del navegador si existe y, si no, la del servidor; las otras fuerzan una (para probar). */
export type EnglishVoicePreference = 'auto' | 'server' | 'browser';

const STORAGE_KEY = 'aura_voice_en';

export function loadVoicePreference(): EnglishVoicePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'server' || raw === 'browser' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Elige la fuente de la voz en inglés. Antes se le pedía "en-US" al navegador y, si no tenía ninguna voz en inglés,
 * leía el inglés con la voz en español. Ahora, sin voz del navegador, se usa la del servidor.
 */
export function chooseEnglishSource(
  voices: SpeechSynthesisVoice[],
  serverAvailable: boolean,
  preference: EnglishVoicePreference = 'auto',
  navigatorLang = '',
): EnglishVoiceSource {
  const browserVoice = pickVoice(voices, 'en', navigatorLang);
  const browser: EnglishVoiceSource | null = browserVoice ? { kind: 'browser', name: browserVoice.name } : null;
  const server: EnglishVoiceSource | null = serverAvailable ? { kind: 'server' } : null;

  const order = preference === 'server' ? [server, browser] : [browser, server];
  for (const source of order) {
    if (source) return source;
  }
  return { kind: 'none' };
}

/** Texto corto para mostrar en pantalla. */
export function describeEnglishSource(source: EnglishVoiceSource): string {
  switch (source.kind) {
    case 'server':
      return 'voz estadounidense del servidor';
    case 'browser':
      return `voz del navegador (${source.name})`;
    default:
      return 'no hay voz en inglés disponible';
  }
}
