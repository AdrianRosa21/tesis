import { describe, expect, it } from 'vitest';
import { maskBlanks, speakableText } from './spokenBlanks';

describe('maskBlanks', () => {
  it('conserva la longitud y quita los puntos de los huecos', () => {
    const text = '11. Susan ........ eat meat, but now she does.';
    const masked = maskBlanks(text);

    expect(masked).toHaveLength(text.length);
    expect(masked).toBe('11. Susan ________ eat meat, but now she does.');
  });

  it('no toca los puntos normales ni los puntos suspensivos de tres', () => {
    expect(maskBlanks('Hola. Wait... what? Fin.')).toBe('Hola. Wait... what? Fin.');
  });

  it('tambien cubre guiones bajos y puntos suspensivos repetidos', () => {
    expect(maskBlanks('Name: ______ Age: ……')).toBe('Name: ______ Age: __');
  });
});

describe('speakableText', () => {
  it('dice el hueco como "blank" en ingles y "espacio en blanco" en espanol', () => {
    expect(speakableText('Susan ........ eat meat.', 'en').spoken).toBe('Susan blank eat meat.');
    expect(speakableText('Mi hermano ........ a la escuela.', 'es').spoken).toBe(
      'Mi hermano espacio en blanco a la escuela.',
    );
  });

  it('un texto sin huecos queda igual y el resaltado no se mueve', () => {
    const { spoken, toOriginal } = speakableText('Hola mundo, esta es una prueba.', 'es');

    expect(spoken).toBe('Hola mundo, esta es una prueba.');
    expect(toOriginal(5, 5)).toEqual({ start: 5, length: 5 });
  });

  it('no deja espacios dobles y separa el hueco de las palabras pegadas', () => {
    expect(speakableText('Name: ________', 'en').spoken).toBe('Name: blank');
    expect(speakableText('no....a', 'en').spoken).toBe('no blank a');
    expect(speakableText('4. .................. adults know.', 'en').spoken).toBe('4. blank adults know.');
  });

  it('varios huecos en la misma frase', () => {
    expect(speakableText('A ...... B ...... C', 'en').spoken).toBe('A blank B blank C');
  });

  it('el resaltado: una palabra despues del hueco cae en su lugar y el hueco se resalta completo', () => {
    const text = ' Susan ........ eat meat.';
    const { spoken, toOriginal } = speakableText(text, 'en');

    expect(spoken).toBe(' Susan blank eat meat.');
    // "Susan" esta antes del hueco: misma posicion.
    expect(toOriginal(spoken.indexOf('Susan'), 5)).toEqual({ start: 1, length: 5 });
    // "blank" -> los 8 puntos.
    expect(toOriginal(spoken.indexOf('blank'), 5)).toEqual({ start: 7, length: 8 });
    // "eat" y "meat." despues del hueco: se corrige el desfase.
    expect(toOriginal(spoken.indexOf('eat'), 3)).toEqual({ start: text.indexOf('eat'), length: 3 });
    expect(toOriginal(spoken.indexOf('meat'), 4)).toEqual({ start: text.indexOf('meat'), length: 4 });
  });

  it('en espanol las tres palabras de "espacio en blanco" resaltan el mismo hueco', () => {
    const text = 'Yo ........ pan.';
    const { spoken, toOriginal } = speakableText(text, 'es');

    for (const word of ['espacio', 'en', 'blanco']) {
      expect(toOriginal(spoken.indexOf(word), word.length)).toEqual({ start: 3, length: 8 });
    }
    expect(toOriginal(spoken.indexOf('pan'), 3)).toEqual({ start: text.indexOf('pan'), length: 3 });
  });
});
