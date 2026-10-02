import { useCallback, useEffect, useRef } from 'react';

interface SpaceRateOptions {
  /** Toque corto de la barra espaciadora (sin flechas): pausar o continuar. */
  onTap: () => void;
  /** Espacio sostenido + flecha arriba (+1) o abajo (-1): cambiar la velocidad. */
  onAdjust: (steps: number) => void;
  /** Se soltó el espacio después de haber cambiado la velocidad. */
  onRelease: () => void;
}

/**
 * La barra espaciadora tiene dos usos: un toque pausa/continúa, y mantenida
 * junto con ↑/↓ cambia la velocidad de lectura. Por eso la pausa se decide al
 * SOLTAR la tecla: si en medio se usó una flecha, no se pausa.
 */
export function useSpaceRate(options: SpaceRateOptions) {
  const optionsRef = useRef(options);
  const state = useRef({ down: false, adjusted: false });

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !state.current.down) return;
      event.preventDefault();
      const { adjusted } = state.current;
      state.current = { down: false, adjusted: false };
      if (adjusted) optionsRef.current.onRelease();
      else optionsRef.current.onTap();
    };
    const reset = () => {
      state.current = { down: false, adjusted: false };
    };

    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', reset);
    };
  }, []);

  /** Devuelve true si la tecla fue consumida por este control. */
  const handleKeyDown = useCallback((event: KeyboardEvent): boolean => {
    if (event.key === ' ') {
      event.preventDefault();
      if (!event.repeat && !state.current.down) {
        state.current = { down: true, adjusted: false };
      }
      return true;
    }

    if (state.current.down && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      state.current.adjusted = true;
      optionsRef.current.onAdjust(event.key === 'ArrowUp' ? 1 : -1);
      return true;
    }

    return false;
  }, []);

  return { handleKeyDown };
}
