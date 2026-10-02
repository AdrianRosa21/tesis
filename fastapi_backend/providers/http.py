"""POST con un reintento ante fallos pasajeros (5xx o red), compartido por los proveedores en la nube."""
import asyncio
from typing import Any

import httpx

from fastapi_backend.providers.base import ProviderError, error_from_response


async def post_json(
    client: httpx.AsyncClient,
    provider: str,
    url: str,
    *,
    json: dict[str, Any],
    headers: dict[str, str],
    timeout: float,
    retries: int = 1,
    retry_wait_s: float = 1.0,
) -> httpx.Response:
    """Devuelve la respuesta si no es un error 5xx; los 4xx los interpreta quien llama.

    Un timeout NO se reintenta: ya consumio el tiempo que hay antes del corte de Cloudflare."""
    last: ProviderError | None = None
    for attempt in range(retries + 1):
        try:
            response = await client.post(url, json=json, headers=headers, timeout=timeout)
        except httpx.TimeoutException as exc:
            raise ProviderError(
                504,
                "El servicio de IA tardó demasiado en responder.",
                log_detail=f"{provider}: sin respuesta en {timeout:.0f} s",
            ) from exc
        except httpx.HTTPError as exc:
            last = ProviderError(
                503,
                "No se pudo conectar con el servicio de IA.",
                log_detail=f"{provider}: {type(exc).__name__}: {exc}",
            )
        else:
            if response.status_code < 500:
                return response
            last = error_from_response(provider, response)

        if attempt < retries:
            await asyncio.sleep(retry_wait_s)

    assert last is not None
    raise last
