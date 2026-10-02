import type { ReactNode } from 'react';

interface ControlButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

// Boton con aria-disabled: App.tsx lo lee para anunciar "Deshabilitado" por voz.
export function ControlButton({ onClick, disabled = false, children }: ControlButtonProps) {
  return (
    <button
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : 'false'}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {children}
    </button>
  );
}
