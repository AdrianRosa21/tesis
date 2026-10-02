import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATE, MAX_RATE, MIN_RATE, RATE_STEP, clampRate, formatRate, loadRate, saveRate } from './speechRate';

afterEach(() => localStorage.clear());

describe('clampRate', () => {
  it('limita al rango permitido', () => {
    expect(clampRate(0.1)).toBe(MIN_RATE);
    expect(clampRate(9)).toBe(MAX_RATE);
  });

  it('redondea a multiplos del paso sin errores de coma flotante', () => {
    expect(clampRate(1.07)).toBe(1.05);
    let rate = 1;
    for (let i = 0; i < 7; i += 1) rate = clampRate(rate + RATE_STEP);
    expect(rate).toBe(1.35);
  });

  it('usa el valor por defecto si el numero no es valido', () => {
    expect(clampRate(Number.NaN)).toBe(DEFAULT_RATE);
  });
});

describe('persistencia', () => {
  it('guarda y recupera la velocidad', () => {
    saveRate(1.25);
    expect(loadRate()).toBe(1.25);
  });

  it('usa la velocidad normal si no hay nada guardado o esta danado', () => {
    expect(loadRate()).toBe(DEFAULT_RATE);
    localStorage.setItem('aura_speech_rate', 'abc');
    expect(loadRate()).toBe(DEFAULT_RATE);
  });
});

describe('formatRate', () => {
  it('muestra dos decimales', () => {
    expect(formatRate(1)).toBe('1.00');
    expect(formatRate(1.05)).toBe('1.05');
  });
});
