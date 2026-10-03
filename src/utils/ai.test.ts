import { describe, expect, it } from 'vitest';
import { buildSpokenElement } from './elementSpeech';
import { parseModelDescription, splitByLength, splitIntoLines, splitIntoSentences, splitLongTextElements } from './ai';

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

// Lo que el servidor devuelve de verdad para R11 pag. 29: UN bloque con 20 lineas separadas por saltos de linea.
const FOOD_LIST_WITH_NEWLINES =
  'ESCUELAS DE TIEMPO COMPLETO EN EL DF\n\nCEREALES SIN GRASA\n\nCada porción equivale a:\nEnergía 70 kcal\nProteína 2 g\n' +
  'Lípidos 0 g\nCarbohidratos 15 g\n\nCereales sin grasa  Porción\nArroz cocido 1/3 taza\nAvena cocida 3/4 taza\n' +
  'Bolillo 1/3 pieza\nCereal 1/2 taza\nElote natural 3/4 pieza\nGalletas marías 5 piezas\nPan tostado 3/4 rebanada';

describe('splitIntoLines', () => {
  it('cada linea de una lista es una unidad', () => {
    expect(splitIntoLines('Arroz cocido 1/3 taza\nAvena cocida 3/4 taza\n\nBolillo 1/3 pieza')).toEqual([
      'Arroz cocido 1/3 taza',
      'Avena cocida 3/4 taza',
      'Bolillo 1/3 pieza',
    ]);
  });

  it('une un renglon cortado a mitad de frase con su continuacion', () => {
    expect(splitIntoLines('La percepción multimodal combina información\ntextual y visual en los documentos.')).toEqual([
      'La percepción multimodal combina información textual y visual en los documentos.',
    ]);
  });

  it('no une lineas que si terminaron o que empiezan con mayuscula', () => {
    expect(splitIntoLines('Cada porción equivale a:\nenergía 70 kcal')).toHaveLength(2);
    expect(splitIntoLines('Primera linea.\nSegunda linea')).toHaveLength(2);
    expect(splitIntoLines('Proteína 2 g\nLípidos 0 g')).toHaveLength(2);
  });

  it('las opciones de una lista (a) b) c)) no se unen aunque empiecen en minuscula', () => {
    expect(splitIntoLines('a) uno\nb) dos\nc) tres')).toEqual(['a) uno', 'b) dos', 'c) tres']);
  });

  it('un texto sin saltos de linea queda igual', () => {
    expect(splitIntoLines('Un solo renglon')).toEqual(['Un solo renglon']);
  });
});

describe('splitLongTextElements con listas (saltos de linea)', () => {
  it('"sale de un solo": la lista de 20 lineas pasa a ser 20 elementos que se recorren con las flechas', () => {
    const result = splitLongTextElements([{ type: 'Texto', content: FOOD_LIST_WITH_NEWLINES, lang: 'es' }]);

    expect(result.map(element => element.content)).toContain('Avena cocida 3/4 taza');
    expect(result.map(element => element.content)).toContain('ESCUELAS DE TIEMPO COMPLETO EN EL DF');
    expect(result.length).toBeGreaterThanOrEqual(15);
    expect(Math.max(...result.map(element => element.content.length))).toBeLessThan(60);
    expect(result.every(element => element.type === 'Texto' && element.lang === 'es')).toBe(true);
  });

  it('no pierde ninguna palabra al partir', () => {
    const result = splitLongTextElements([{ type: 'Texto', content: FOOD_LIST_WITH_NEWLINES }]);
    const words = (text: string) => text.split(/\s+/).filter(Boolean);

    expect(result.flatMap(element => words(element.content))).toEqual(words(FOOD_LIST_WITH_NEWLINES));
  });

  it('un bloque corto de dos lineas (titulo y subtitulo) tambien se separa', () => {
    expect(splitLongTextElements([{ type: 'Texto', content: 'Título\nSubtítulo' }])).toHaveLength(2);
  });

  it('las tablas no se parten por lineas', () => {
    const table = [{ type: 'Tabla', content: 'Fila 1. A: 1\nFila 2. A: 2' }];
    expect(splitLongTextElements(table)).toEqual(table);
  });
});

// Lo que el modelo devolvio de verdad para un examen de ingles con instrucciones en espanol: UN solo bloque "es".
const MIXED_EXAM =
  'Examen de inglés - Unidad 3\n\nInstrucciones: elige la opción correcta para completar cada oración.\n\n' +
  'Nombre: ____________________   Grupo: ______\n\n' +
  '1.  The kid was .................. fast that no one saw him.\na) so          b) too          c) such\n' +
  '2.  .............. adults know how to use the Internet.\na) Little          b) Few          c) Much\n' +
  '3.  .......... to the party next Friday.\na) Do you come          b) Are you coming          c) Did you come';

describe('splitLongTextElements con idiomas mezclados en un bloque', () => {
  const units = () => splitLongTextElements([{ type: 'Texto', content: MIXED_EXAM, lang: 'es' }]);
  const langOf = (start: string) => units().find(element => element.content.startsWith(start))?.lang;

  it('las instrucciones en espanol se leen en espanol', () => {
    expect(langOf('Examen de inglés')).toBe('es');
    expect(langOf('Instrucciones')).toBe('es');
    expect(langOf('Nombre')).toBe('es');
  });

  it('las oraciones en ingles se leen en ingles aunque el bloque venga etiquetado "es"', () => {
    expect(langOf('1.')).toBe('en');
    expect(langOf('2.')).toBe('en');
    expect(langOf('3.')).toBe('en');
  });

  it('las opciones cortas sin pistas ("a) so b) too c) such") toman el idioma de la oracion que las precede', () => {
    expect(langOf('a) so')).toBe('en');
    expect(langOf('a) Little')).toBe('en');
    expect(langOf('a) Do you come')).toBe('en');
  });

  it('de punta a punta: la voz de cada linea es la correcta', () => {
    const voiceFor = (start: string) => {
      const element = units().find(candidate => candidate.content.startsWith(start))!;
      return buildSpokenElement(element, 'es').lang;
    };

    expect(voiceFor('Instrucciones')).toBe('es');
    expect(voiceFor('2.')).toBe('en');
    expect(voiceFor('a) Little')).toBe('en');
  });

  it('el inicio sin pistas toma el idioma de la primera linea clara que sigue', () => {
    const result = splitLongTextElements([{ type: 'Texto', content: '1.\nThe kid was so fast that no one saw him.', lang: 'es' }]);

    expect(result.map(element => element.lang)).toEqual(['en', 'en']);
  });

  it('si ninguna linea es clara, se queda la etiqueta del modelo', () => {
    const result = splitLongTextElements([{ type: 'Texto', content: 'a) 12\nb) 34', lang: 'en' }]);

    expect(result.map(element => element.lang)).toEqual(['en', 'en']);
  });

  it('una pagina en espanol sigue leyendose entera en espanol', () => {
    const result = splitLongTextElements([{ type: 'Texto', content: FOOD_LIST_WITH_NEWLINES, lang: 'es' }]);

    expect(result.every(element => element.lang === 'es')).toBe(true);
  });
});

describe('parseModelDescription', () => {
  it('convierte las lineas con prefijo en elementos', () => {
    const elements = parseModelDescription('[TEXTO] Hola\n[IMAGEN] Un perro\n[DUDOSO] Algo borroso');
    expect(elements.map(element => element.type)).toEqual(['Texto', 'Descripción Visual', 'Contenido dudoso']);
  });
});
