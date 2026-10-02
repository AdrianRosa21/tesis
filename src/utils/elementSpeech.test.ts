import { describe, expect, it } from 'vitest';
import { buildSpokenElement, pageLanguage, resolveElementLang } from './elementSpeech';

describe('buildSpokenElement', () => {
  it('lee el texto normal sin anunciar el tipo', () => {
    const spoken = buildSpokenElement({ type: 'Texto', content: 'La percepción multimodal combina información textual y visual.' });
    expect(spoken).toEqual({ text: 'La percepción multimodal combina información textual y visual.', lang: 'es' });
  });

  it('detecta ingles en el texto y usa voz en ingles', () => {
    const spoken = buildSpokenElement({ type: 'Texto', content: 'The results show that the method is faster than the baseline.' });
    expect(spoken.lang).toBe('en');
    expect(spoken.text.startsWith('The results')).toBe(true);
  });

  it('las descripciones visuales siempre van en espanol, aunque mencionen texto en ingles', () => {
    const spoken = buildSpokenElement({ type: 'Descripción Visual', content: 'Un cartel con la frase "The end is the beginning of all things".' });
    expect(spoken.lang).toBe('es');
    expect(spoken.text.startsWith('Descripción Visual: ')).toBe(true);
  });

  it('respeta el idioma que declara el backend', () => {
    const spoken = buildSpokenElement({ type: 'Tabla', content: 'Row 1. Month: Jan; Cases: 93', lang: 'en' });
    expect(spoken).toEqual({ text: 'Table: Row 1. Month: Jan; Cases: 93', lang: 'en' });
  });

  it('usa el idioma de la pagina cuando el bloque es corto o ambiguo', () => {
    expect(buildSpokenElement({ type: 'Texto', content: '1250' }, 'en').lang).toBe('en');
    expect(buildSpokenElement({ type: 'Texto', content: '1250' }, 'es').lang).toBe('es');
  });
});

describe('resolveElementLang', () => {
  it('ignora idiomas sin voz configurada y cae a la deteccion', () => {
    expect(resolveElementLang({ type: 'Texto', content: 'Le chat est sur la table', lang: 'fr' })).toBe('es');
  });
});

describe('pageLanguage', () => {
  it('elige el idioma con mas texto', () => {
    const lang = pageLanguage([
      { type: 'Texto', content: 'The method is described in the following section and it was tested on the corpus.' },
      { type: 'Texto', content: 'Hola.' },
      { type: 'Descripción Visual', content: 'Una gráfica de barras con dos series y un título en la parte superior.' },
    ]);
    expect(lang).toBe('en');
  });

  it('por defecto es espanol', () => {
    expect(pageLanguage([])).toBe('es');
  });
});
