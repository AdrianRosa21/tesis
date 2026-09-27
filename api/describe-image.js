const MAX_BODY_BYTES = 8 * 1024 * 1024;

export const maxDuration = 300;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ detail: 'Método no permitido.' });
  }

  const contentLength = Number(request.headers['content-length'] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return response.status(413).json({ detail: 'La página es demasiado grande para analizarla.' });
  }

  const backendUrl = process.env.AURA_BACKEND_URL?.replace(/\/$/, '');
  const apiKey = process.env.AURA_API_KEY;
  if (!backendUrl || !apiKey) {
    return response.status(503).json({ detail: 'El servicio de análisis no está configurado.' });
  }

  try {
    const upstream = await fetch(`${backendUrl}/api/describe-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(295_000),
    });

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return response.status(502).json({ detail: 'El servidor de análisis devolvió una respuesta inválida.' });
    }

    const payload = await upstream.json();
    return response.status(upstream.status).json(payload);
  } catch (error) {
    console.error('AURA proxy error:', error);
    if (error instanceof Error && error.name === 'TimeoutError') {
      return response.status(504).json({ detail: 'El análisis tardó demasiado.' });
    }
    return response.status(503).json({ detail: 'El servicio de análisis no está disponible.' });
  }
}
