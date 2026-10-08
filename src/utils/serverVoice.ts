// Cliente de la voz en inglés del servidor (Piper, voz estadounidense). Se usa cuando el navegador no tiene
// ninguna voz en inglés. Si el servidor no responde, AURA vuelve sola a la voz del navegador.

import { BLANK_RUN } from './spokenBlanks';

const RETRY_AFTER_FAILURE_MS = 60_000;
const STATUS_TIMEOUT_MS = 5_000;
const AUDIO_TIMEOUT_MS = 15_000;
/** Cuántas frases se guardan listas para reproducir (se descartan las más viejas). */
const MAX_CACHED = 40;

function endpoint(): { url: string; headers: Record<string, string> } {
  const base = import.meta.env.DEV
    ? (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')
    : '';
  const headers: Record<string, string> = {};
  const key = import.meta.env.DEV ? import.meta.env.VITE_API_KEY?.trim() : undefined;
  if (key) headers['x-api-key'] = key;
  return { url: `${base}/api/tts`, headers };
}

/**
 * Los puntos o guiones bajos repetidos de los exámenes ("............") son espacios en blanco. Un motor de voz
 * los lee como silencio o como "punto punto": se dicen como "blank".
 */
export function cleanForServerVoice(text: string): string {
  return text
    .replace(BLANK_RUN, ' blank ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export class ServerVoice {
  private state: boolean | null = null;
  private failedAt = 0;
  private statusRequest: Promise<boolean> | null = null;
  private audio = new Map<string, Promise<string>>();

  /** Último resultado conocido. Es false mientras no se haya consultado o después de un fallo reciente. */
  get available(): boolean {
    return this.state === true;
  }

  /** Pregunta al servidor si tiene voz. Se consulta una vez; tras un fallo se reintenta pasado un minuto. */
  check(): Promise<boolean> {
    if (this.state === true) return Promise.resolve(true);
    if (this.state === false && Date.now() - this.failedAt < RETRY_AFTER_FAILURE_MS) return Promise.resolve(false);
    if (this.statusRequest) return this.statusRequest;

    const { url, headers } = endpoint();
    this.statusRequest = fetchWithTimeout(url, { headers }, STATUS_TIMEOUT_MS)
      .then(async (response) => {
        if (!response.ok) return false;
        const body = await response.json() as { available?: boolean; languages?: string[] };
        return Boolean(body.available) && (body.languages ?? []).includes('en');
      })
      .catch(() => false)
      .then((ok) => {
        this.state = ok;
        if (!ok) this.failedAt = Date.now();
        this.statusRequest = null;
        return ok;
      });
    return this.statusRequest;
  }

  /** El audio de una frase falló: se deja de usar la voz del servidor por un rato. */
  markFailed(): void {
    this.state = false;
    this.failedAt = Date.now();
  }

  /** URL local del audio de la frase (se descarga una sola vez). Rechaza si el servidor falla. */
  getAudioUrl(text: string): Promise<string> {
    const cached = this.audio.get(text);
    if (cached) return cached;

    const { url, headers } = endpoint();
    const request = fetchWithTimeout(
      url,
      { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang: 'en' }) },
      AUDIO_TIMEOUT_MS,
    ).then(async (response) => {
      if (!response.ok) throw new Error(`La voz del servidor respondió ${response.status}`);
      return URL.createObjectURL(await response.blob());
    });

    this.audio.set(text, request);
    request.catch(() => this.audio.delete(text)); // un fallo no se guarda: se podrá reintentar
    this.evictOld();
    return request;
  }

  /** Empieza a descargar la frase siguiente mientras suena la actual. */
  prefetch(text: string): void {
    this.getAudioUrl(text).catch(() => undefined);
  }

  private evictOld(): void {
    while (this.audio.size > MAX_CACHED) {
      const oldest = this.audio.keys().next().value as string;
      const request = this.audio.get(oldest);
      this.audio.delete(oldest);
      request?.then((blobUrl) => URL.revokeObjectURL(blobUrl)).catch(() => undefined);
    }
  }

  /** Libera el audio guardado (por ejemplo al cambiar de documento). */
  clear(): void {
    for (const request of this.audio.values()) {
      request.then((blobUrl) => URL.revokeObjectURL(blobUrl)).catch(() => undefined);
    }
    this.audio.clear();
  }
}

export const serverVoice = new ServerVoice();
