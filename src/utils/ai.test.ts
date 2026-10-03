import { describe, expect, it } from 'vitest';
import { parseModelDescription, splitByLength, splitIntoSentences, splitLongTextElements } from './ai';

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

// Texto real de una pagina del corpus (R11, pag. 29) que llego como UN solo bloque de ~430 caracteres sin puntos.
const FOOD_LIST =
  'ESCUELAS DE TIEMPO COMPLETO EN EL DF CEREALES SIN GRASA Cada porción equivale a: Energía 70 kcal Proteína 2 g ' +
  'Lípidos 0 g Carbohidratos 15 g Cereales sin grasa Porción Arroz cocido 1/3 taza Avena cocida 3/4 taza ' +
  'Bolillo 1/3 pieza Cereal 1/2 taza Elote natural 3/4 pieza Galletas marías 5 piezas Pan tostado 3/4 rebanada ' +
  'Papa blanca 1/2 pieza Pasta de trigo cocida 1/2 taza Tortilla 1 pieza Espagueti 1/2 taza Fideo crudo 1/4 taza';

describe('splitByLength', () => {
  it('parte un bloque largo sin puntos en trozos manejables y no pierde ni una palabra', () => {
    expect(FOOD_LIST.length).toBeGreaterThan(400); // mucho mas que una unidad (220)

    const pieces = splitByLength(FOOD_LIST);

    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(pieces.every(piece => piece.length <= 250)).toBe(true);
    expect(pieces.join(' ')).toBe(FOOD_LIST);
  });

  it('nunca separa una cantidad de su unidad ("3/4 | taza")', () => {
    const pieces = splitByLength(FOOD_LIST);

    for (const piece of pieces) {
      expect(piece, `el trozo termina en una cifra suelta: "${piece.slice(-25)}"`).not.toMatch(/\d[\d/.,%]*$/);
    }
  });

  it('prefiere cortar en una coma antes que a mitad de frase', () => {
    const text = `${'palabra '.repeat(20)}primera parte, ${'otra '.repeat(30)}segunda parte`;

    const [first] = splitByLength(text);

    expect(first.endsWith('primera parte,')).toBe(true);
  });

  it('un texto sin espacios se corta a la fuerza en vez de quedarse enorme', () => {
    const pieces = splitByLength('x'.repeat(500));

    expect(pieces.every(piece => piece.length <= 220)).toBe(true);
    expect(pieces.join('')).toBe('x'.repeat(500));
  });

  it('un texto corto queda entero', () => {
    expect(splitByLength('Una frase corta.')).toEqual(['Una frase corta.']);
  });
});

describe('splitLongTextElements con bloques largos sin puntuacion', () => {
  it('divide el parrafo gigante en varios elementos: subir desde "Fin de la pagina" ya no repite toda la pagina', () => {
    const result = splitLongTextElements([{ type: 'Texto', content: FOOD_LIST, lang: 'es' }]);

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.every(element => element.type === 'Texto' && element.lang === 'es')).toBe(true);
    expect(Math.max(...result.map(element => element.content.length))).toBeLessThanOrEqual(250);
  });

  it('una oracion muy larga con punto final tambien se parte, sin perder la puntuacion', () => {
    const sentence = `${'palabra '.repeat(60)}final.`;

    const result = splitLongTextElements([{ type: 'Texto', content: sentence }]);

    expect(result.length).toBeGreaterThan(1);
    expect(result[result.length - 1].content.endsWith('final.')).toBe(true);
  });

  it('las oraciones normales siguen divididas por punto como antes', () => {
    expect(splitLongTextElements([{ type: 'Texto', content: LONG_PARAGRAPH }])).toHaveLength(3);
  });
});

describe('parseModelDescription', () => {
  it('convierte las lineas con prefijo en elementos', () => {
    const elements = parseModelDescription('[TEXTO] Hola\n[IMAGEN] Un perro\n[DUDOSO] Algo borroso');
    expect(elements.map(element => element.type)).toEqual(['Texto', 'Descripción Visual', 'Contenido dudoso']);
  });
});
