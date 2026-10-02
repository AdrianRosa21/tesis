import type { AnalysisMeta } from './ai';

const PAGE_TYPE_LABELS: Record<string, string> = {
  tabla: 'tabla',
  grafica: 'gráfica',
  diagrama: 'diagrama',
  imagen: 'imagen',
  matematicas: 'matemáticas',
};

export const STEP_LABELS: Record<string, string> = {
  deteccion: 'Detección',
  extraccion: 'Extracción',
  llamada_enfocada: 'Llamada enfocada',
  respaldo: 'Respaldo local',
};

export function formatSeconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

/** Resume lo que el detector vio en la pagina, ej. "imagen · 3 columnas". */
export function describePageType(meta: AnalysisMeta): string | null {
  const type = meta.pageType;
  if (!type) return null;

  const found = Object.entries(PAGE_TYPE_LABELS)
    .filter(([key]) => Boolean(type[key as keyof typeof type]))
    .map(([, label]) => label);
  const columns = type.columnas && type.columnas > 1 ? `${type.columnas} columnas` : null;
  const parts = [...found, ...(columns ? [columns] : [])];
  return parts.length > 0 ? parts.join(' · ') : 'solo texto';
}

/** Motor que respondio, ej. "gemini (gemini-2.5-flash) · detección con ollama". */
export function describeEngine(meta: AnalysisMeta): string | null {
  if (!meta.provider) return null;
  const main = meta.model ? `${meta.provider} (${meta.model})` : meta.provider;
  return meta.detector ? `${main} · detección con ${meta.detector}` : main;
}
