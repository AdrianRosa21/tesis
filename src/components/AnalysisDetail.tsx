import type { AnalysisMeta } from '../utils/ai';
import { STEP_LABELS, describeEngine, describePageType, formatSeconds } from '../utils/analysisSummary';

// Panel visual con lo que se ve en los logs del backend: que se detecto en la
// pagina, que paso en cada etapa y cuanto tardo.
export function AnalysisDetail({ meta }: { meta: AnalysisMeta | null }) {
  if (!meta) return null;

  const pageType = describePageType(meta);
  const engine = describeEngine(meta);

  return (
    <div className="status-box" aria-hidden="true" style={{ marginBottom: '1rem', padding: '0.5rem' }}>
      <p style={{ margin: 0 }}><strong>Detalle del análisis</strong></p>
      {pageType && <p style={{ margin: 0 }}>Se detectó: {pageType}</p>}
      {engine && <p style={{ margin: 0 }}>Motor: {engine}</p>}
      {meta.fallbackReason && (
        <p style={{ margin: 0 }}>Se usó el respaldo local porque el servicio en la nube falló: {meta.fallbackReason}</p>
      )}
      {meta.steps.map((step, index) => (
        <p key={`${step.name}-${index}`} style={{ margin: 0 }}>
          {STEP_LABELS[step.name] ?? step.name}
          {step.engine ? ` (${step.engine})` : ''}
          {step.detail ? `: ${step.detail}` : ''} — {formatSeconds(step.seconds)}
        </p>
      ))}
      <p style={{ margin: 0 }}>
        Página procesada en {meta.serverSeconds !== null ? formatSeconds(meta.serverSeconds) : 'tiempo no informado'}
        {' '}(total en tu navegador: {formatSeconds(meta.clientSeconds)}) con {meta.elementCount} elementos.
        {meta.cached ? ' Respuesta desde caché.' : ''}
      </p>
    </div>
  );
}
