// Proxy privado de la voz en ingles del servidor (Piper). Igual que describe-image: agrega la clave
// secreta del lado del servidor para que nunca llegue al navegador.
//   GET  /api/tts  -> { available, languages, voice }  (el navegador pregunta si puede usarla)
//   POST /api/tts  -> audio/wav de una frase en ingles
const MAX_BODY_BYTES = 8 * 1024;

export const maxDuration = 30;

// IP real de quien usa AURA: el backend limita las peticiones por persona, no por proxy.
function clientIp(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(request.headers['x-real-ip'] || '').trim();
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ detail: 'Método no permitido.' });
  }

  const backendUrl = process.env.AURA_BACKEND_URL?.replace(/\/$/, '');
  const apiKey = process.env.AURA_API_KEY;
  if (!backendUrl || !apiKey) {
    return response.status(503).json({ detail: 'La voz del servidor no está configurada.' });
  }

  const isStatus = request.method === 'GET';
  if (!isStatus) {
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return response.status(413).json({ detail: 'El texto es demasiado largo.' });
    }
  }

  try {
    const headers = { 'x-api-key': apiKey };
    if (!isStatus) headers['Content-Type'] = 'application/json';
    const ip = clientIp(request);
    if (ip) headers['x-aura-client-ip'] = ip;

    const upstream = await fetch(`${backendUrl}/api/tts${isStatus ? '/status' : ''}`, {
      method: request.method,
      headers,
      body: isStatus ? undefined : JSON.stringify(request.body),
      signal: AbortSignal.timeout(25_000),
    });

    const contentType = upstream.headers.get('content-type') || '';
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) response.setHeader('Retry-After', retryAfter);

    if (contentType.includes('audio/wav')) {
      response.setHeader('Content-Type', 'audio/wav');
      response.setHeader('Cache-Control', 'private, max-age=3600');
      return response.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
    }
    if (!contentType.includes('application/json')) {
      return response.status(502).json({ detail: 'El servidor de voz devolvió una respuesta inválida.' });
    }
    return response.status(upstream.status).json(await upstream.json());
  } catch (error) {
    console.error('AURA tts proxy error:', error);
    if (error instanceof Error && error.name === 'TimeoutError') {
      return response.status(504).json({ detail: 'La voz del servidor tardó demasiado.' });
    }
    return response.status(503).json({ detail: 'La voz del servidor no está disponible.' });
  }
}
