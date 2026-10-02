import { useEffect, useRef } from 'react';

/**
 * Escucha las teclas de toda la ventana. El manejador se guarda en una ref para
 * ver siempre el estado más reciente sin quitar y poner el listener en cada render.
 */
export function useWindowKeydown(handler: (event: KeyboardEvent) => void): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handlerRef.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}

export function isTypingTarget(element: Element | null): boolean {
  const tag = element?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
