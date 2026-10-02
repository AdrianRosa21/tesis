import { describe, expect, it } from 'vitest';
import { parseModelDescription, splitIntoSentences, splitLongTextElements } from './ai';

const LONG_PARAGRAPH =
  'Además de la germanía propia de la gente de espada, en la lengua franca utilizada por los militares españoles se mezclaban palabras flamencas. ' +
  'Hechos al mundo de frontera, los hombres de la monarquía hispana recurrían a esos términos con naturalidad. ' +
  'Eso dio lugar a un modo pintoresco de registrar palabras extranjeras.';

describe('splitIntoSentences', () => {
  it('divide por punto, signos de cierre y conserva la puntuacion', () => {
    expect(splitIntoSentences('Uno. ¿Dos? ¡Tres!')).toEqual(['Uno.', '¿Dos?', '¡Tres!']);
  });
});

describe('splitLongTextElements', () => {
  it('divide los bloques de texto largos y conserva el idioma', () => {
    const result = splitLongTextElements([{ type: 'Texto', content: LONG_PARAGRAPH, lang: 'es' }]);
    expect(result).toHaveLength(3);
    expect(result.every(element => element.lang === 'es' && element.type === 'Texto')).toBe(true);
  });

  it('no toca bloques cortos ni de otros tipos', () => {
    const elements = [
      { type: 'Texto', content: 'Título corto.' },
      { type: 'Tabla', content: LONG_PARAGRAPH },
    ];
    expect(splitLongTextElements(elements)).toEqual(elements);
  });
});

describe('parseModelDescription', () => {
  it('convierte las lineas con prefijo en elementos', () => {
    const elements = parseModelDescription('[TEXTO] Hola\n[IMAGEN] Un perro\n[DUDOSO] Algo borroso');
    expect(elements.map(element => element.type)).toEqual(['Texto', 'Descripción Visual', 'Contenido dudoso']);
  });
});
