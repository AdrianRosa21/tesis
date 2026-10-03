import { useCallback, useEffect, useRef } from 'react';
import { rateStepForKey } from '../utils/speechRate';

/** Tiempo sin pulsar + o - para anunciar la velocidad en que quedó. */
const SETTLE_MS = 600;
/** Al mantener la tecla, máximo un cambio cada tanto (si no, la velocidad se dispara). */
const REPEAT_MS = 120;

interface RateKeysOptions {
  /** +1 (más rápido) o -1 (más lento), un paso de la velocidad. */
  onAdjust: (steps: number) => void;
  /** Se dejó de pulsar: es el momento de decir la velocidad final. */
  onSettle: () => void;
}

/**
 * Teclas + y - (también las del teclado numérico) para cambiar la velocidad de lectura.
 * Se anuncia la velocidad una sola vez al terminar, no en cada pulsación.
 */
export function useRateKeys(options: RateKeysOptions) {
  const optionsRef = useRef(options);
  const timer = useRef<number | undefined>(undefined);
  const lastAdjust = useRef(0);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Devuelve true si la tecla fue consumida por este control. */
  const handleKeyDown = useCallback((event: KeyboardEvent): boolean => {
    const step = rateStepForKey(event);
    if (step === 0) return false;

    event.preventDefault();
    const now = Date.now();
    if (event.repeat && now - lastAdjust.current < REPEAT_MS) return true;
    lastAdjust.current = now;

    optionsRef.current.onAdjust(step);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => optionsRef.current.onSettle(), SETTLE_MS);
    return true;
  }, []);

  return { handleKeyDown };
}
