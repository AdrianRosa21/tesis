import { describe, expect, it } from 'vitest';
import type { AnalysisMeta } from './ai';
import { describeEngine, describePageType } from './analysisSummary';

function meta(overrides: Partial<AnalysisMeta> = {}): AnalysisMeta {
  return {
    pageType: null,
    serverSeconds: 29.27,
    clientSeconds: 30.1,
    provider: null,
    model: null,
    detector: null,
    steps: [],
    fallbackReason: null,
    cached: false,
    elementCount: 2,
    ...overrides,
  };
}

describe('describePageType', () => {
  it('lista lo detectado y las columnas', () => {
    const result = describePageType(meta({ pageType: { tabla: false, imagen: true, columnas: 3 } }));
    expect(result).toBe('imagen · 3 columnas');
  });

  it('dice "solo texto" si no se detecto nada especial', () => {
    expect(describePageType(meta({ pageType: { imagen: false, columnas: 1 } }))).toBe('solo texto');
  });

  it('devuelve null si no hay clasificacion', () => {
    expect(describePageType(meta())).toBeNull();
  });
});

describe('describeEngine', () => {
  it('muestra el proveedor, el modelo y el detector', () => {
    expect(describeEngine(meta({ provider: 'gemini', model: 'gemini-2.5-flash', detector: 'ollama' })))
      .toBe('gemini (gemini-2.5-flash) · detección con ollama');
  });

  it('devuelve null si el backend no informo el motor', () => {
    expect(describeEngine(meta())).toBeNull();
  });
});
