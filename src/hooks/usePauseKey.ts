import { useCallback, useEffect, useRef } from 'react';

/**
 * La barra espaciadora pausa o continúa la lectura AL INSTANTE (al presionarla, no al soltarla).
 * Mantenerla presionada no repite la acción. Al soltarla se cancela su efecto nativo
 * (activar el botón enfocado), para que no pause dos veces.
 */
export function usePauseKey(onToggle: () => void) {
  const onToggleRef = useRef(onToggle);
  const down = useRef(false);

  useEffect(() => {
    onToggleRef.current = onToggle;
  });

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !down.current) return;
      event.preventDefault();
      down.current = false;
    };
    const reset = () => {
      down.current = false;
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
    if (event.key !== ' ') return false;
    event.preventDefault();
    if (!event.repeat && !down.current) {
      down.current = true;
      onToggleRef.current();
    }
    return true;
  }, []);

  return { handleKeyDown };
}
