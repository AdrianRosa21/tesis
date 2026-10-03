import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePauseKey } from './usePauseKey';

function setup() {
  const onToggle = vi.fn();
  const { result } = renderHook(() => usePauseKey(onToggle));
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    const consumed = result.current.handleKeyDown(event);
    return { consumed, prevented: event.defaultPrevented };
  };
  const release = (key: string) => fireEvent.keyUp(window, { key });
  return { onToggle, press, release };
}

describe('usePauseKey', () => {
  it('el espacio pausa/continúa AL PRESIONARLO, sin esperar a soltarlo', () => {
    const { onToggle, press } = setup();

    expect(press(' ')).toEqual({ consumed: true, prevented: true });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('mantener el espacio (repetición de tecla) no cuenta como varias pausas', () => {
    const { onToggle, press, release } = setup();

    press(' ');
    press(' ', { repeat: true });
    press(' ', { repeat: true });
    release(' ');

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('cada pulsación nueva vuelve a alternar', () => {
    const { onToggle, press, release } = setup();

    press(' ');
    release(' ');
    press(' ');
    release(' ');

    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('otras teclas no se consumen', () => {
    const { onToggle, press } = setup();

    expect(press('+').consumed).toBe(false);
    expect(press('ArrowUp').consumed).toBe(false);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('un keyup de espacio sin keydown previo se ignora (venía de un campo de texto)', () => {
    const { onToggle, release } = setup();

    release(' ');

    expect(onToggle).not.toHaveBeenCalled();
  });
});
