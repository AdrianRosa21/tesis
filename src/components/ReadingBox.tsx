import type { PageElement } from '../utils/ai';
import type { HighlightState } from '../hooks/useSpeech';

interface ReadingBoxProps {
  element: PageElement;
  text: string;
  highlight: HighlightState | null;
}

function isTitle(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.includes('título') || lower.includes('titulo');
}

export function ReadingBox({ element, text, highlight }: ReadingBoxProps) {
  const type = element.type.toLowerCase();
  const title = isTitle(element.type);

  return (
    <div
      className="reading-box"
      aria-hidden="true"
      style={{
        backgroundColor: 'var(--bg-color)',
        padding: '1rem',
        borderRadius: '4px',
        marginBottom: '1rem',
        border: '2px solid var(--focus-color)',
        fontSize: title ? '2rem' : '1.5rem',
        fontWeight: title ? 'bold' : 'normal',
        lineHeight: '1.8',
      }}
    >
      {type.includes('imagen') && (
        <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🖼️ Imagen: </span>
      )}
      {type.includes('tabla') && (
        <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>📊 Tabla: </span>
      )}

      {highlight ? (
        <>
          {text.substring(0, highlight.start)}
          <mark className="highlight-word" style={{ backgroundColor: 'yellow', color: 'black', borderRadius: '2px' }}>
            {text.substring(highlight.start, highlight.start + highlight.length)}
          </mark>
          {text.substring(highlight.start + highlight.length)}
        </>
      ) : (
        <>{text}</>
      )}
    </div>
  );
}
