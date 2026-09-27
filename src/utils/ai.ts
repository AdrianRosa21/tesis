export type ElementType = string;

export interface PageElement {
  type: ElementType;
  content: string;
}

interface ApiErrorPayload {
  detail?: string;
  error?: string;
}

interface ApiSuccessPayload {
  success?: boolean;
  description?: string;
  elements?: unknown;
  prompt_version?: string;
}

export class AuraAnalysisError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuraAnalysisError';
  }
}

const PREFIX_TYPES: Record<string, ElementType> = {
  TEXTO: 'Texto',
  IMAGEN: 'Descripción Visual',
  TABLA: 'Tabla',
  DUDOSO: 'Contenido dudoso',
};

function isPageElement(value: unknown): value is PageElement {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PageElement>;
  return typeof candidate.type === 'string' && typeof candidate.content === 'string' && Boolean(candidate.content.trim());
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
}

function parseMarkdownTable(lines: string[]): PageElement[] {
  const contentLines = lines.filter(line => !/^\s*\|?\s*:?-{3,}/.test(line));
  if (contentLines.length === 0) return [];

  const headers = tableCells(contentLines[0]);
  const elements: PageElement[] = [{ type: 'Tabla', content: `Encabezados: ${headers.join('; ')}` }];
  for (const line of contentLines.slice(1)) {
    const cells = tableCells(line);
    const content = cells.length === headers.length
      ? headers.map((header, index) => `${header}: ${cells[index]}`).join('; ')
      : cells.join('; ');
    elements.push({ type: 'Tabla', content });
  }
  return elements;
}

export function parseModelDescription(description: string): PageElement[] {
  const cleanDescription = description.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const elements: PageElement[] = [];
  const paragraph: string[] = [];
  const table: string[] = [];

  const flushParagraph = () => {
    const content = paragraph.map(line => line.trim()).filter(Boolean).join(' ').trim();
    if (content) elements.push({ type: 'Texto', content });
    paragraph.length = 0;
  };

  const flushTable = () => {
    if (table.length > 0) elements.push(...parseMarkdownTable(table));
    table.length = 0;
  };

  const lines = cleanDescription.replace(/\r\n?/g, '\n').split('\n');
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) {
      flushTable();
      flushParagraph();
      continue;
    }

    const marker = line.match(/^\[(TEXTO|IMAGEN|TABLA|DUDOSO)\]\s*(.*)$/i);
    if (marker) {
      flushTable();
      flushParagraph();
      const content = marker[2].trim();
      if (content) elements.push({ type: PREFIX_TYPES[marker[1].toUpperCase()], content });
      continue;
    }

    const nextLine = lines[index + 1]?.trim() || '';
    const tableSeparator = /^\s*\|?\s*:?-{3,}/;
    const isTableLine = line.includes('|') && (
      table.length > 0 || tableSeparator.test(line) || tableSeparator.test(nextLine)
    );
    if (isTableLine) {
      flushParagraph();
      table.push(line);
      continue;
    }

    flushTable();
    paragraph.push(line);
  }

  flushTable();
  flushParagraph();
  return elements;
}

function errorMessageForStatus(status: number, backendMessage?: string): string {
  switch (status) {
    case 401:
      return 'AURA no está autorizada para usar el servicio de análisis. Revisa la configuración del servidor.';
    case 413:
      return 'La página genera una imagen demasiado grande para analizarla. Intenta con un PDF de menor resolución.';
    case 502:
      return 'El modelo de inteligencia artificial rechazó la página. Intenta nuevamente.';
    case 503:
      return 'El servicio de análisis está apagado o no está disponible en este momento.';
    case 504:
      return 'El análisis tardó demasiado y fue cancelado. Intenta nuevamente.';
    default:
      return backendMessage || `El servicio de análisis respondió con el código ${status}.`;
  }
}

export async function analyzePageStructure(canvasDataUrl: string, nativeText?: string | null): Promise<PageElement[]> {
  const optimizedDataUrl = await optimizeImage(canvasDataUrl);

  try {
    const API_URL = import.meta.env.DEV
      ? (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')
      : '';
    const API_KEY = import.meta.env.DEV ? import.meta.env.VITE_API_KEY?.trim() : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['x-api-key'] = API_KEY;

    const response = await fetch(`${API_URL}/api/describe-image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image: optimizedDataUrl,
        context: nativeText?.trim() || undefined,
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({})) as ApiErrorPayload;
      const backendMessage = errorPayload.detail || errorPayload.error;
      throw new AuraAnalysisError(errorMessageForStatus(response.status, backendMessage));
    }

    const data = await response.json() as ApiSuccessPayload;
    if (!data.success) {
      throw new AuraAnalysisError('El servicio respondió sin confirmar el análisis de la página.');
    }

    if (Array.isArray(data.elements)) {
      const structuredElements = data.elements.filter(isPageElement).map(element => ({
        type: element.type.trim(),
        content: element.content.trim(),
      }));
      if (structuredElements.length > 0) return structuredElements;
    }

    if (data.description?.trim()) {
      const parsedElements = parseModelDescription(data.description);
      if (parsedElements.length > 0) return parsedElements;
    }

    return [{ type: 'Texto', content: 'Página en blanco o sin contenido reconocible.' }];
  } catch (error) {
    console.error('Error contactando al backend de IA:', error);
    if (error instanceof AuraAnalysisError) throw error;
    throw new AuraAnalysisError(
      'No se pudo conectar con el servicio de análisis. Comprueba si el servidor está encendido.',
      { cause: error },
    );
  }
}

function optimizeImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1600;
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
