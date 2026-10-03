import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateStepForKey } from '../utils/speechRate';
import { useRateKeys } from './useRateKeys';

function key(k: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
}

describe('rateStepForKey', () => {
  it('+ y = suben, - y _ bajan (con o sin Shift, teclado numérico incluido)', () => {
    expect(rateStepForKey(key('+'))).toBe(1);
    expect(rateStepForKey(key('='))).toBe(1);
    expect(rateStepForKey(key('-'))).toBe(-1);
    expect(rateStepForKey(key('_'))).toBe(-1);
  });

  it('otras teclas no son de velocidad', () => {
    for (const k of ['ArrowUp', 'ArrowDown', ' ', 'f', 'v', '1']) {
      expect(rateStepForKey(key(k))).toBe(0);
    }
  });

  it('con Ctrl, Alt o Cmd no cuenta: son los atajos de zoom del navegador', () => {
    expect(rateStepForKey(key('+', { ctrlKey: true }))).toBe(0);
    expect(rateStepForKey(key('-', { ctrlKey: true }))).toBe(0);
    expect(rateStepForKey(key('-', { altKey: true }))).toBe(0);
    expect(rateStepForKey(key('+', { metaKey: true }))).toBe(0);
  });
});

describe('useRateKeys', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const onAdjust = vi.fn();
    const onSettle = vi.fn();
    const { result, unmount } = renderHook(() => useRateKeys({ onAdjust, onSettle }));
    const press = (k: string, init: KeyboardEventInit = {}) => {
      const event = key(k, init);
      const consumed = result.current.handleKeyDown(event);
      return { consumed, prevented: event.defaultPrevented };
    };
    return { onAdjust, onSettle, press, unmount };
  }

  it('+ sube y - baja un paso, y la tecla se consume (no se propaga a otros atajos)', () => {
    const { onAdjust, press } = setup();

    expect(press('+')).toEqual({ consumed: true, prevented: true });
    expect(press('-')).toEqual({ consumed: true, prevented: true });

    expect(onAdjust.mock.calls).toEqual([[1], [-1]]);
  });

  it('las flechas y el espacio no se consumen: siguen navegando y pausando', () => {
    const { onAdjust, press } = setup();

    expect(press('ArrowUp').consumed).toBe(false);
    expect(press('ArrowDown').consumed).toBe(false);
    expect(press(' ').consumed).toBe(false);
    expect(onAdjust).not.toHaveBeenCalled();
  });

  it('Ctrl y + (zoom del navegador) no cambia la velocidad ni se bloquea', () => {
    const { onAdjust, press } = setup();

    expect(press('+', { ctrlKey: true })).toEqual({ consumed: false, prevented: false });
    expect(onAdjust).not.toHaveBeenCalled();
  });

  it('anuncia la velocidad UNA vez, cuando se deja de pulsar', () => {
    const { onSettle, press } = setup();

    press('+');
    vi.advanceTimersByTime(300);
    press('+');
    vi.advanceTimersByTime(300);
    press('-');
    expect(onSettle).not.toHaveBeenCalled(); // sigue pulsando: no se interrumpe con anuncios

    act(() => vi.advanceTimersByTime(700));
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it('mantener la tecla cambia la velocidad poco a poco, no en cada repetición', () => {
    const { onAdjust, press } = setup();
    vi.setSystemTime(10_000);

    press('+'); // la pulsación inicial siempre cuenta
    vi.setSystemTime(10_030);
    press('+', { repeat: true }); // repetición del sistema, muy seguida: se ignora
    vi.setSystemTime(10_060);
    press('+', { repeat: true });
    vi.setSystemTime(10_200);
    press('+', { repeat: true }); // ya pasó el intervalo: cuenta

    expect(onAdjust).toHaveBeenCalledTimes(2);
  });

  it('al cerrar la página no queda ningún anuncio pendiente', () => {
    const { onSettle, press, unmount } = setup();

    press('+');
    unmount();
    vi.advanceTimersByTime(2000);

    expect(onSettle).not.toHaveBeenCalled();
  });
});
