import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { ControlButton } from './ControlButton';

interface ReaderControlsProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  isProcessing: boolean;
  currentPage: number;
  totalPages: number;
  pageInputValue: string;
  onPageInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPageInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  canRead: boolean;
  canRepeat: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  onSelectFile: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRead: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  onRepeat: () => void;
  onBack: () => void;
  onOpenTutorial: () => void;
}

export function ReaderControls({
  fileInputRef,
  onFileChange,
  isProcessing,
  currentPage,
  totalPages,
  pageInputValue,
  onPageInputChange,
  onPageInputKeyDown,
  canRead,
  canRepeat,
  isSpeaking,
  isPaused,
  onSelectFile,
  onPrevious,
  onNext,
  onRead,
  onPauseResume,
  onStop,
  onRepeat,
  onBack,
  onOpenTutorial,
}: ReaderControlsProps) {
  return (
    <div className="controls" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <input
        type="file"
        accept="application/pdf"
        ref={fileInputRef}
        onChange={onFileChange}
        aria-label="Seleccionar archivo PDF"
        id="file-upload"
        style={{ display: 'none' }}
      />
      <ControlButton onClick={onSelectFile} disabled={isProcessing}>
        Seleccionar PDF (R)
      </ControlButton>

      {totalPages > 0 && (
        <>
          <ControlButton onClick={onPrevious} disabled={currentPage <= 1 || isProcessing}>
            Página anterior (Flecha Izq)
          </ControlButton>
          <ControlButton onClick={onNext} disabled={currentPage >= totalPages || isProcessing}>
            Página siguiente (Flecha Der)
          </ControlButton>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
            Ir a página:
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInputValue}
              disabled={isProcessing}
              aria-disabled={isProcessing ? 'true' : 'false'}
              onChange={onPageInputChange}
              onKeyDown={onPageInputKeyDown}
              style={{ fontSize: '1.25rem', padding: '0.5rem', width: '80px' }}
              aria-label="Ir a la página. Escribe el número y presiona Enter o Espacio."
            />
          </label>

          <ControlButton onClick={onRead} disabled={!canRead || isProcessing}>
            Leer página actual (F)
          </ControlButton>
          <ControlButton onClick={onPauseResume} disabled={!isSpeaking && !isPaused}>
            {isPaused ? 'Continuar (Espacio)' : 'Pausar (Espacio)'}
          </ControlButton>
          <ControlButton onClick={onStop}>
            Detener (G)
          </ControlButton>
          <ControlButton onClick={onRepeat} disabled={!canRepeat || isProcessing}>
            Repetir línea (V)
          </ControlButton>
        </>
      )}

      <ControlButton onClick={onBack}>
        Volver al inicio (J)
      </ControlButton>
      <ControlButton onClick={onOpenTutorial}>
        Tutorial (H)
      </ControlButton>
    </div>
  );
}
