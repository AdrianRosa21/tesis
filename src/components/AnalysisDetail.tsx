import type { AnalysisMeta } from '../utils/ai';
import { describePageType } from '../utils/analysisSummary';

// Panel visual con lo que se detecto en la pagina. El motor, las etapas y los tiempos no se muestran aqui:
// siguen en /api/ready, en los logs en vivo y en `meta` (para las pruebas y la tesis).
export function AnalysisDetail({ meta }: { meta: AnalysisMeta | null }) {
  if (!meta) return null;

  const pageType = describePageType(meta);
  if (!pageType && !meta.fallbackReason) return null;

  return (
    <div className="status-box" aria-hidden="true" style={{ marginBottom: '1rem', padding: '0.5rem' }}>
      <p style={{ margin: 0 }}><strong>Detalle del análisis</strong></p>
      {pageType && <p style={{ margin: 0 }}>Se detectó: {pageType}</p>}
      {meta.fallbackReason && (
        <p style={{ margin: 0 }}>Se usó el respaldo local porque el servicio en la nube falló: {meta.fallbackReason}</p>
      )}
    </div>
  );
}
