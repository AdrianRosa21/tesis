import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PageElement } from '../utils/ai';
import { useReadingNavigation } from './useReadingNavigation';

const ELEMENTS: PageElement[] = [
  { type: 'Texto', content: 'Primera parte.', lang: 'es' },
  { type: 'Texto', content: 'Segunda parte.', lang: 'es' },
  { type: 'Texto', content: 'Tercera parte.', lang: 'es' },
];

function setup() {
  const speak = vi.fn();
  const { result } = renderHook(() => useReadingNavigation({ speak }));
  const said = () => speak.mock.calls.map(([text]) => text);
  return { result, speak, said };
}

describe('useReadingNavigation', () => {
  it('lee de arriba hacia abajo y avisa el fin de la pagina', () => {
    const { result, said } = setup();

    act(() => result.current.start(ELEMENTS));
    act(() => result.current.next(ELEMENTS));
    act(() => result.current.next(ELEMENTS));
    act(() => result.current.next(ELEMENTS));

    expect(said()).toEqual(['Primera parte.', 'Segunda parte.', 'Tercera parte.', 'Fin de la página.']);
  });

  it('al subir desde "Fin de la página" lee SOLO el último elemento, no la página otra vez', () => {
    const { result, said } = setup();
    act(() => result.current.start(ELEMENTS));
    act(() => result.current.next(ELEMENTS));
    act(() => result.current.next(ELEMENTS));
    act(() => result.current.next(ELEMENTS)); // Fin de la página

    act(() => result.current.previous(ELEMENTS));

    expect(said().at(-1)).toBe('Tercera parte.');
    expect(said().filter(text => text === 'Primera parte.')).toHaveLength(1); // la primera no se repitió
  });

  it('seguir subiendo retrocede de a un elemento', () => {
    const { result, said } = setup();
    act(() => result.current.start(ELEMENTS));
    act(() => result.current.next(ELEMENTS));
    act(() => result.current.next(ELEMENTS));
    act(() => result.current.next(ELEMENTS)); // Fin

    act(() => result.current.previous(ELEMENTS)); // Tercera
    act(() => result.current.previous(ELEMENTS)); // Segunda
    act(() => result.current.previous(ELEMENTS)); // Primera

    expect(said().slice(-3)).toEqual(['Tercera parte.', 'Segunda parte.', 'Primera parte.']);
  });

  it('cada lectura cancela a la anterior: nunca se acumulan dos audios', () => {
    const { result, speak } = setup();
    act(() => result.current.start(ELEMENTS));
    act(() => result.current.next(ELEMENTS));
    act(() => result.current.next(ELEMENTS));
    act(() => result.current.next(ELEMENTS));
    act(() => result.current.previous(ELEMENTS));

    // speak() de useSpeech detiene lo anterior antes de empezar; aqui se comprueba que se pide una sola vez por pulsacion
    expect(speak).toHaveBeenCalledTimes(5);
  });

  it('V repite el elemento actual sin avanzar', () => {
    const { result, said } = setup();
    act(() => result.current.start(ELEMENTS));
    act(() => result.current.next(ELEMENTS));

    act(() => result.current.repeat(ELEMENTS));
    act(() => result.current.repeat(ELEMENTS));

    expect(said().slice(-3)).toEqual(['Segunda parte.', 'Segunda parte.', 'Segunda parte.']);
  });
});
