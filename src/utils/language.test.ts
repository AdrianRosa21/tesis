import { describe, expect, it } from 'vitest';
import { detectLanguage, normalizeLang, pickVoice } from './language';

function fakeVoice(lang: string, isDefault = false): SpeechSynthesisVoice {
  return { lang, name: `voz ${lang}`, default: isDefault, localService: true, voiceURI: lang } as SpeechSynthesisVoice;
}

describe('detectLanguage', () => {
  it('reconoce espanol', () => {
    expect(detectLanguage('La percepción multimodal combina información textual y visual en los documentos.')).toBe('es');
  });

  it('reconoce ingles', () => {
    expect(detectLanguage('The quick brown fox jumps over the lazy dog and it was a sunny day.')).toBe('en');
  });

  it('devuelve null con textos demasiado cortos', () => {
    expect(detectLanguage('Page 2')).toBeNull();
    expect(detectLanguage('')).toBeNull();
  });

  it('un texto corto con tildes o ñ es espanol (el ingles casi no las usa)', () => {
    expect(detectLanguage('Energía 70 kcal')).toBe('es');
    expect(detectLanguage('Año 2024')).toBe('es');
    expect(detectLanguage('¿Cuánto?')).toBe('es');
  });

  it('devuelve null cuando no hay palabras reconocibles (cifras, nombres propios)', () => {
    expect(detectLanguage('Alonso Contreras 1250 3x 7/12')).toBeNull();
  });

  it('devuelve null si el texto es ambiguo', () => {
    expect(detectLanguage('que the el and')).toBeNull();
  });

  it('usa tildes y signos del espanol como pista', () => {
    expect(detectLanguage('¿Qué opción es correcta? Ésta, sí')).toBe('es');
  });
});

describe('normalizeLang', () => {
  it('acepta codigos con region', () => {
    expect(normalizeLang('es-MX')).toBe('es');
    expect(normalizeLang('EN_us')).toBe('en');
  });

  it('descarta idiomas sin voz configurada', () => {
    expect(normalizeLang('fr')).toBeNull();
    expect(normalizeLang(undefined)).toBeNull();
  });
});

describe('pickVoice', () => {
  const voices = [fakeVoice('en-GB'), fakeVoice('es-ES'), fakeVoice('en-US'), fakeVoice('es-MX'), fakeVoice('fr-FR')];

  it('elige una voz del idioma pedido', () => {
    expect(pickVoice(voices, 'en')?.lang).toBe('en-US');
    expect(pickVoice(voices, 'es')?.lang).toBe('es-MX');
  });

  it('prefiere la region del navegador del usuario', () => {
    expect(pickVoice(voices, 'es', 'es-ES')?.lang).toBe('es-ES');
    expect(pickVoice(voices, 'en', 'en-GB')?.lang).toBe('en-GB');
  });

  it('devuelve null si no hay voz de ese idioma', () => {
    expect(pickVoice([fakeVoice('fr-FR')], 'es')).toBeNull();
  });
});
