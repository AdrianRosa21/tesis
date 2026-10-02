import type { RefObject } from 'react';

interface PdfViewerProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  visible: boolean;
}

// La página se dibuja en un canvas; es solo apoyo visual (aria-hidden): la lectura va por voz.
export function PdfViewer({ canvasRef, visible }: PdfViewerProps) {
  return (
    <div
      style={{
        border: '1px solid var(--text-color)',
        backgroundColor: '#eaeaea',
        display: visible ? 'block' : 'none',
        overflow: 'auto',
        padding: '1rem',
        maxHeight: '70vh',
        textAlign: 'center',
      }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        style={{ maxWidth: '100%', height: 'auto', display: 'inline-block', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }}
      />
    </div>
  );
}
