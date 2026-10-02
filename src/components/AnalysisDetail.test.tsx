import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnalysisMeta } from '../utils/ai';
import { AnalysisDetail } from './AnalysisDetail';

function meta(overrides: Partial<AnalysisMeta> = {}): AnalysisMeta {
  return {
    pageType: { imagen: true, columnas: 3 },
    serverSeconds: 29.27,
    clientSeconds: 30.1,
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    detector: 'ollama',
    steps: [
      { name: 'deteccion', engine: 'ollama', seconds: 2.1, detail: 'imagen' },
      { name: 'extraccion', engine: 'gemini', seconds: 5.4 },
    ],
    fallbackReason: null,
    cached: false,
    elementCount: 2,
    ...overrides,
  };
}

// Sin `globals: true` Testing Library no limpia solo el DOM entre pruebas.
afterEach(cleanup);

describe('AnalysisDetail', () => {
  it('no muestra nada sin datos del analisis', () => {
    const { container } = render(<AnalysisDetail meta={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('muestra lo detectado, el motor, las etapas y el tiempo', () => {
    render(<AnalysisDetail meta={meta()} />);

    expect(screen.getByText('Se detectó: imagen · 3 columnas')).toBeTruthy();
    expect(screen.getByText('Motor: gemini (gemini-2.5-flash) · detección con ollama')).toBeTruthy();
    expect(screen.getByText(/Detección \(ollama\): imagen — 2\.10 s/)).toBeTruthy();
    expect(screen.getByText(/Página procesada en 29\.27 s/)).toBeTruthy();
    expect(screen.queryByText(/respaldo local/)).toBeNull();
  });

  it('avisa cuando se uso el respaldo local y por que', () => {
    render(<AnalysisDetail meta={meta({ fallbackReason: 'gemini respondio HTTP 429: cuota' })} />);

    expect(screen.getByText(/respaldo local.*gemini respondio HTTP 429: cuota/)).toBeTruthy();
  });
});
