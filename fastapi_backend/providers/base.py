"""Contrato comun de los proveedores de vision y sus errores."""
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx


class ProviderError(Exception):
    """Fallo de un proveedor en la nube. `status_code` es lo que AURA le devuelve al cliente."""

    def __init__(self, status_code: int, message: str, *, log_detail: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.log_detail = log_detail


@dataclass
class ModelResult:
    text: str
    finish_reason: str = ""
    usage: dict[str, int] = field(default_factory=dict)


class VisionProvider(Protocol):
    name: str
    model: str

    async def generate(
        self,
        client: httpx.AsyncClient,
        prompt: str,
        image_b64: str,
        *,
        schema: dict[str, Any] | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
        repeat_penalty: float | None = None,
    ) -> ModelResult: ...


_OUT_OF_CREDIT_CODES = {"credit_balance_exhausted", "insufficient_quota", "organization_spend_limit_exceeded"}


def error_from_response(provider: str, response: httpx.Response) -> ProviderError:
    """Traduce un error HTTP del proveedor a un mensaje para el cliente y un detalle para el log."""
    code = ""
    try:
        body = response.json()
        error = body.get("error", body) if isinstance(body, dict) else body
        detail = error.get("message") if isinstance(error, dict) else str(error)
        if isinstance(error, dict):
            code = str(error.get("code") or "")
    except ValueError:
        detail = response.text
    detail = (detail or "")[:300]
    status = response.status_code
    log = f"{provider} respondio HTTP {status}: {detail}"

    # Saldo agotado o tope de gasto: es un 429, pero esperar no lo arregla (OpenAI).
    if code in _OUT_OF_CREDIT_CODES:
        return ProviderError(503, "El servicio de IA no tiene saldo o crédito disponible.", log_detail=log)

    if status in (401, 403):
        return ProviderError(
            502, "El servicio de IA rechazó las credenciales configuradas en el servidor.", log_detail=log
        )
    if status == 402:
        return ProviderError(503, "El servicio de IA no tiene saldo o crédito disponible.", log_detail=log)
    if status == 404:
        return ProviderError(502, "El modelo de IA configurado no existe o no está disponible.", log_detail=log)
    if status == 429:
        return ProviderError(
            503, "El servicio de IA alcanzó su límite de uso. Intenta de nuevo en un momento.", log_detail=log
        )
    if status == 400:
        return ProviderError(502, "El servicio de IA rechazó la solicitud.", log_detail=log)
    return ProviderError(502, "El servicio de IA tuvo un error. Intenta nuevamente.", log_detail=log)
