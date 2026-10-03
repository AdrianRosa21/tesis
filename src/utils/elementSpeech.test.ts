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

describe('resolveElementLang: el texto manda sobre la etiqueta del modelo', () => {
  const SPANISH = 'Cada porción equivale a la energía de los cereales y del pan tostado.';
  const ENGLISH = 'The kid was so fast that no one saw him in the park.';

  it('texto en espanol con etiqueta "en" equivocada se lee en espanol', () => {
    expect(resolveElementLang({ type: 'Texto', content: SPANISH, lang: 'en' })).toBe('es');
  });

  it('texto en ingles con etiqueta "es" equivocada se lee en ingles', () => {
    expect(resolveElementLang({ type: 'Texto', content: ENGLISH, lang: 'es' })).toBe('en');
  });

  it('cuando etiqueta y texto coinciden, no cambia nada', () => {
    expect(resolveElementLang({ type: 'Texto', content: SPANISH, lang: 'es' })).toBe('es');
    expect(resolveElementLang({ type: 'Texto', content: ENGLISH, lang: 'en' })).toBe('en');
  });

  it('un texto corto con tildes es espanol aunque el modelo lo marque en ingles ("Energía 70 kcal")', () => {
    expect(resolveElementLang({ type: 'Texto', content: 'Energía 70 kcal', lang: 'en' })).toBe('es');
    expect(resolveElementLang({ type: 'Texto', content: '¿Cuántos?', lang: 'en' })).toBe('es');
  });

  it('si el texto es demasiado corto o ambiguo, decide la etiqueta del modelo', () => {
    expect(resolveElementLang({ type: 'Texto', content: 'a) so   b) too   c) such', lang: 'en' })).toBe('en');
    expect(resolveElementLang({ type: 'Texto', content: 'Table 5', lang: 'en' }, 'es')).toBe('en');
    expect(resolveElementLang({ type: 'Texto', content: '1250', lang: 'es' }, 'en')).toBe('es');
  });

  it('sin etiqueta ni pista en el texto, usa el idioma de la pagina', () => {
    expect(resolveElementLang({ type: 'Texto', content: '1250' }, 'en')).toBe('en');
  });

  it('las descripciones visuales no cambian: siempre en espanol, aunque citen ingles', () => {
    const description = 'The kid was so fast that no one saw him: es el texto que aparece en el cartel.';
    expect(resolveElementLang({ type: 'Descripción Visual', content: description, lang: 'es' })).toBe('es');
    expect(resolveElementLang({ type: 'Descripción Visual', content: ENGLISH })).toBe('es');
  });
});

describe('pageLanguage con etiquetas equivocadas', () => {
  it('un texto en espanol mal etiquetado como ingles no vuelve ingles a toda la pagina', () => {
    const lang = pageLanguage([
      { type: 'Texto', content: 'Cada porción equivale a la energía de los cereales y del pan tostado.', lang: 'en' },
      { type: 'Texto', content: 'Los resultados de la encuesta muestran que el consumo aumentó en los últimos años.', lang: 'en' },
    ]);
    expect(lang).toBe('es');
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
