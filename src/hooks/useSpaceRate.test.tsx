import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSpaceRate } from './useSpaceRate';

function setup() {
  const onTap = vi.fn();
  const onAdjust = vi.fn();
  const onRelease = vi.fn();
  const { result } = renderHook(() => useSpaceRate({ onTap, onAdjust, onRelease }));

  // Igual que la pagina: el manejador de teclas llama primero a este control.
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    const consumed = result.current.handleKeyDown(event);
    return { consumed, prevented: event.defaultPrevented };
  };
  const release = (key: string) => fireEvent.keyUp(window, { key });

  return { onTap, onAdjust, onRelease, press, release };
}

describe('useSpaceRate', () => {
  it('un toque a la barra espaciadora pausa/continua al soltar', () => {
    const { onTap, onAdjust, press, release } = setup();
    expect(press(' ').consumed).toBe(true);
    expect(onTap).not.toHaveBeenCalled();
    release(' ');
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onAdjust).not.toHaveBeenCalled();
  });

  it('espacio sostenido + flechas cambia la velocidad y NO pausa', () => {
    const { onTap, onAdjust, onRelease, press, release } = setup();
    press(' ');
    expect(press('ArrowUp').consumed).toBe(true);
    expect(press('ArrowUp').consumed).toBe(true);
    expect(press('ArrowDown').consumed).toBe(true);
    release(' ');

    expect(onAdjust.mock.calls).toEqual([[1], [1], [-1]]);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('las flechas sin espacio no se consumen (siguen navegando)', () => {
    const { onAdjust, press } = setup();
    expect(press('ArrowUp').consumed).toBe(false);
    expect(onAdjust).not.toHaveBeenCalled();
  });

  it('mantener el espacio (repeticion de tecla) no cuenta como varios toques', () => {
    const { onTap, press, release } = setup();
    press(' ');
    press(' ', { repeat: true });
    press(' ', { repeat: true });
    release(' ');
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('al soltar el espacio se reinicia: el siguiente toque vuelve a pausar', () => {
    const { onTap, onAdjust, press, release } = setup();
    press(' ');
    press('ArrowUp');
    release(' ');
    press(' ');
    release(' ');
    expect(onAdjust).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('un keyup de espacio sin keydown previo se ignora (p. ej. venia de un campo de texto)', () => {
    const { onTap, onRelease, release } = setup();
    release(' ');
    expect(onTap).not.toHaveBeenCalled();
    expect(onRelease).not.toHaveBeenCalled();
  });
});
