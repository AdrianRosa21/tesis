// Velocidad de lectura: se cambia de a poco (RATE_STEP) y se recuerda entre sesiones.
export const MIN_RATE = 0.5;
export const MAX_RATE = 2.5;
export const RATE_STEP = 0.05;
export const DEFAULT_RATE = 1;

const STORAGE_KEY = 'aura_speech_rate';

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_RATE;
  const snapped = Math.round(rate / RATE_STEP) * RATE_STEP;
  const clamped = Math.min(MAX_RATE, Math.max(MIN_RATE, snapped));
  return Math.round(clamped * 100) / 100;
}

export function loadRate(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? DEFAULT_RATE : clampRate(parseFloat(raw));
  } catch {
    return DEFAULT_RATE;
  }
}

export function saveRate(rate: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(rate));
  } catch {
    /* sin almacenamiento: la velocidad solo vale para esta sesion */
  }
}

export function formatRate(rate: number): string {
  return rate.toFixed(2);
}

/**
 * Qué hace una tecla con la velocidad: +1 (más rápido) con + o =, -1 (más lento) con - o _,
 * 0 si no es de velocidad. Con Ctrl, Alt o Cmd no cuenta: son los atajos de zoom del navegador.
 * Las teclas + y - del teclado numérico llegan con el mismo valor de `key`.
 */
export function rateStepForKey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): number {
  if (event.ctrlKey || event.metaKey || event.altKey) return 0;
  if (event.key === '+' || event.key === '=') return 1;
  if (event.key === '-' || event.key === '_') return -1;
  return 0;
}
