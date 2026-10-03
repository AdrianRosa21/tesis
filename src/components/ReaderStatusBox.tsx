import { formatRate } from '../utils/speechRate';

interface ReaderStatusBoxProps {
  status: string;
  fileName: string;
  currentPage: number;
  totalPages: number;
  rate: number;
  /** De dónde sale la voz que lee en inglés. */
  englishVoice: string;
}

// AURA lee este contenido con su propia voz, asi que se oculta del lector de
// pantalla nativo para que no hablen dos voces sobre lo mismo.
export function ReaderStatusBox({
  status, fileName, currentPage, totalPages, rate, englishVoice,
}: ReaderStatusBoxProps) {
  return (
    <div className="status-box" aria-hidden="true" style={{ marginBottom: '1rem', padding: '0.5rem' }}>
      <p style={{ margin: 0 }}><strong>Estado:</strong> {status}</p>
      {fileName && <p style={{ margin: 0 }}><strong>Archivo:</strong> {fileName}</p>}
      {totalPages > 0 && <p style={{ margin: 0 }}><strong>Página {currentPage} de {totalPages}</strong></p>}
      <p style={{ margin: 0 }}>
        <strong>Velocidad de lectura:</strong> {formatRate(rate)}× (teclas + y -)
      </p>
      <p style={{ margin: 0 }}>
        <strong>Voz en inglés:</strong> {englishVoice}
      </p>
    </div>
  );
}
