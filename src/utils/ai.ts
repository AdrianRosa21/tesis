export type ElementType = string;

export interface PageElement {
  type: ElementType;
  content: string;
  /** Idioma del contenido (ej. "es", "en"), si el backend lo informa. */
  lang?: string;
}

export interface PageType {
  tabla?: boolean;
  grafica?: boolean;
  diagrama?: boolean;
  imagen?: boolean;
  matematicas?: boolean;
  columnas?: number;
}

export interface AnalysisStep {
  name: string;
  engine?: string;
  seconds: number;
  detail?: string;
}

/** Lo que se muestra en pantalla sobre como se analizo la pagina. */
export interface AnalysisMeta {
  pageType: PageType | null;
  /** Tiempo que reporta el backend para procesar la pagina. */
  serverSeconds: number | null;
  /** Tiempo total medido en el navegador (incluye red, proxy y cola). */
  clientSeconds: number;
  provider: string | null;
  model: string | null;
  detector: string | null;
  steps: AnalysisStep[];
  /** Si la nube fallo y se uso el respaldo local, el motivo (para mostrarlo, no para leerlo en voz alta). */
  fallbackReason: string | null;
  cached: boolean;
  elementCount: number;
}

export interface AnalysisResult {
  elements: PageElement[];
  meta: AnalysisMeta;
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
  page_type?: PageType | null;
  processing_seconds?: number;
  provider?: string;
  model?: string;
  detector?: string | null;
  steps?: unknown;
  fallback_reason?: string;
  cached?: boolean;
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

// Umbral en caracteres a partir del cual un bloque de texto se considera
// "largo" y conviene dividirlo por oracion, para que la lectura y la
// navegacion con las flechas avancen oracion por oracion en vez de leer
// un parrafo entero de corrido sin poder pausar en un punto intermedio.
const LONG_TEXT_THRESHOLD = 150;
const SPLITTABLE_TYPES = new Set(['Texto', 'Contenido dudoso']);

export function splitIntoSentences(content: string): string[] {
  const matches = content.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  const sentences = (matches || [content]).map(s => s.trim()).filter(Boolean);
  return sentences.length > 0 ? sentences : [content];
}

// Una "oracion" sin puntos (una lista de alimentos, un parrafo pegado) puede medir cientos de caracteres:
// con las flechas, V (repetir) o subir desde "Fin de la pagina" se repetiria la pagina entera. Se parte
// en trozos de este tamano maximo.
const MAX_UNIT_LENGTH = 220;
const MIN_UNIT_LENGTH = 60;
// Termina en una cifra o fraccion ("3/4", "70", "15,5", "20%"): la cantidad todavia no tiene su unidad.
const ENDS_WITH_QUANTITY = /\d[\d/.,%]*$/;

/**
 * Parte un fragmento largo en trozos de a lo sumo MAX_UNIT_LENGTH caracteres. Corta de preferencia en una coma,
 * punto y coma o dos puntos; si no hay, en un limite de palabra. Nunca deja una cantidad separada de su unidad
 * ("Avena cocida 3/4 | taza"): si el corte cae justo despues de un numero, el trozo incluye la palabra que sigue.
 */
export function splitByLength(text: string, maxLength = MAX_UNIT_LENGTH): string[] {
  const pieces: string[] = [];
  let rest = text.trim();

  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength + 1);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': ')) + 1;

    if (cut < MIN_UNIT_LENGTH) {
      cut = window.lastIndexOf(' ');
      if (cut < MIN_UNIT_LENGTH) {
        cut = maxLength; // una "palabra" larguisima sin espacios: corte duro
      } else if (ENDS_WITH_QUANTITY.test(rest.slice(0, cut))) {
        const afterUnit = rest.indexOf(' ', cut + 1);
        if (afterUnit !== -1 && afterUnit <= maxLength + 25) cut = afterUnit;
      }
    }

    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) pieces.push(rest);
  return pieces;
}

export function splitLongTextElements(elements: PageElement[]): PageElement[] {
  const result: PageElement[] = [];
  for (const element of elements) {
    if (SPLITTABLE_TYPES.has(element.type) && element.content.length > LONG_TEXT_THRESHOLD) {
      const units = splitIntoSentences(element.content).flatMap(sentence =>
        sentence.length > MAX_UNIT_LENGTH ? splitByLength(sentence) : [sentence],
      );
      if (units.length > 1) {
        for (const unit of units) {
          result.push({ ...element, content: unit });
        }
        continue;
      }
    }
    result.push(element);
  }
  return result;
}

function parseSteps(value: unknown): AnalysisStep[] {
  if (!Array.isArray(value)) return [];
  const steps: AnalysisStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const step = item as Record<string, unknown>;
    if (typeof step.name !== 'string' || typeof step.seconds !== 'number') continue;
    steps.push({
      name: step.name,
      seconds: step.seconds,
      engine: typeof step.engine === 'string' ? step.engine : undefined,
      detail: typeof step.detail === 'string' ? step.detail : undefined,
    });
  }
  return steps;
}

function buildMeta(data: ApiSuccessPayload, elementCount: number, clientSeconds: number): AnalysisMeta {
  return {
    pageType: data.page_type ?? null,
    serverSeconds: typeof data.processing_seconds === 'number' ? data.processing_seconds : null,
    clientSeconds,
    provider: data.provider ?? null,
    model: data.model ?? null,
    detector: data.detector ?? null,
    steps: parseSteps(data.steps),
    fallbackReason: typeof data.fallback_reason === 'string' && data.fallback_reason ? data.fallback_reason : null,
    cached: Boolean(data.cached),
    elementCount,
  };
}

function errorMessageForStatus(status: number, backendMessage?: string): string {
  switch (status) {
    case 401:
      return 'AURA no está autorizada para usar el servicio de análisis. Revisa la configuración del servidor.';
    case 413:
      return 'La página genera una imagen demasiado grande para analizarla. Intenta con un PDF de menor resolución.';
    case 429:
      return 'Se hicieron demasiadas solicitudes seguidas. Espera un momento e intenta nuevamente.';
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

export async function analyzePageStructure(canvasDataUrl: string, nativeText?: string | null): Promise<AnalysisResult> {
  const optimizedDataUrl = await optimizeImage(canvasDataUrl);
  const startedAt = performance.now();

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

    const finish = (elements: PageElement[]): AnalysisResult => {
      const clientSeconds = Math.round(((performance.now() - startedAt) / 1000) * 100) / 100;
      return { elements, meta: buildMeta(data, elements.length, clientSeconds) };
    };

    if (Array.isArray(data.elements)) {
      const structuredElements = data.elements.filter(isPageElement).map(element => ({
        type: element.type.trim(),
        content: element.content.trim(),
        lang: typeof element.lang === 'string' ? element.lang : undefined,
      }));
      if (structuredElements.length > 0) return finish(splitLongTextElements(structuredElements));
    }

    if (data.description?.trim()) {
      const parsedElements = parseModelDescription(data.description);
      if (parsedElements.length > 0) return finish(splitLongTextElements(parsedElements));
    }

    return finish([{ type: 'Texto', content: 'Página en blanco o sin contenido reconocible.' }]);
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
