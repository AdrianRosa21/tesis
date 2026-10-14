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

  describe('montos con "$" en espanol (la voz mexicana los lee como "pesos")', () => {
    const es = (text: string) => speakableText(text, 'es').spoken;

    it('dice "dolares" y quita el ".00" y las comas de miles', () => {
      expect(es('Monto: $ 625.00')).toBe('Monto: 625 dólares');
      expect(es('Total inversión por año $ 5,850.00')).toBe('Total inversión por año 5850 dólares');
      expect(es('Costo por trimestre: $1,875.00.')).toBe('Costo por trimestre: 1875 dólares.');
      expect(es('Cuesta US$ 20')).toBe('Cuesta 20 dólares');
    });

    it('singular y centavos', () => {
      expect(es('$1.00')).toBe('1 dólar');
      expect(es('$225.50')).toBe('225 dólares con 50 centavos');
      expect(es('$225.5')).toBe('225 dólares con 50 centavos');
      expect(es('$3.01')).toBe('3 dólares con 1 centavo');
    });

    it('con millones o mil', () => {
      expect(es('Inversión de $5 millones')).toBe('Inversión de 5 millones de dólares');
      expect(es('$1 millón')).toBe('1 millón de dólares');
      expect(es('$5 mil')).toBe('5 mil dólares');
    });

    it('varios montos en la misma frase', () => {
      expect(es('9 mensualidades de $625.00 c/u. = $ 5,625.00')).toBe('9 mensualidades de 625 dólares c/u. = 5625 dólares');
    });

    it('no toca lo que no es un monto claro', () => {
      expect(es('MX$ 100')).toBe('MX$ 100');
      expect(es('$5M')).toBe('$5M');
      expect(es('$5 million')).toBe('$5 million');
      expect(es('$1.875')).toBe('$1.875');
      expect(es('$12,5')).toBe('$12,5');
      expect(es('El signo $ sirve en una fórmula')).toBe('El signo $ sirve en una fórmula');
    });

    it('en inglés no cambia nada (la voz ya dice "dollars")', () => {
      expect(speakableText('Cost: $625.00', 'en').spoken).toBe('Cost: $625.00');
    });

    it('el resaltado cae en su lugar: el monto se resalta completo y lo que sigue no se desfasa', () => {
      const text = 'Monto: $ 625.00 mensual';
      const { spoken, toOriginal } = speakableText(text, 'es');

      expect(spoken).toBe('Monto: 625 dólares mensual');
      expect(toOriginal(spoken.indexOf('625'), 3)).toEqual({ start: 7, length: 8 });
      expect(toOriginal(spoken.indexOf('dólares'), 7)).toEqual({ start: 7, length: 8 });
      expect(toOriginal(spoken.indexOf('mensual'), 7)).toEqual({ start: text.indexOf('mensual'), length: 7 });
    });

    it('un monto y un hueco en la misma frase', () => {
      expect(es('Pagó $ 50.00 y ........ más.')).toBe('Pagó 50 dólares y espacio en blanco más.');
    });
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
