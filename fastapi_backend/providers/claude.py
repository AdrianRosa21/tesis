"""Claude (API Messages de Anthropic) con imagen y salida JSON estructurada.

Reglas de la API (verificadas en la documentacion oficial, familia Claude 5):
- La salida estructurada va en `output_config.format`. `tool_choice` forzado NO funciona en
  Sonnet 5.5 / Opus 5.5 (error 400).
- `temperature` distinto del valor por defecto da error 400 en Sonnet 5.5: solo se manda a Haiku.
- Razonamiento: transcribir una pagina no lo necesita y solo suma tiempo y costo.
    * Sonnet 5.5: `thinking: {"type": "between_tools"}` + effort bajo lo apaga.
    * Opus 5.5 / Fable 5.1: no se puede apagar; effort bajo lo reduce al minimo.
    * Haiku 4.5: sin razonamiento por defecto y no admite `effort`.
- La respuesta puede empezar con un bloque `thinking` (vacio): solo se leen los bloques `text`.
"""
from typing import Any

import httpx

from fastapi_backend.config import Settings
from fastapi_backend.providers.base import ModelResult, ProviderError, error_from_response
from fastapi_backend.providers.http import post_json
from fastapi_backend.schemas import to_anthropic_schema

ANTHROPIC_VERSION = "2023-06-01"

# Modelos donde se puede mandar `effort` por defecto sin riesgo de error.
_EFFORT_MODEL_PREFIXES = ("claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-mythos-5-1")
# `between_tools` solo existe en Sonnet 5.5 y solo con effort <= high.
_LOW_EFFORTS = ("low", "medium", "high")


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, settings: Settings):
        self._settings = settings
        self.model = settings.anthropic_model
        self._api_key = settings.anthropic_api_key or ""

    def _reasoning_params(self) -> tuple[dict[str, str] | None, str | None]:
        """(thinking, effort) que se mandan para este modelo; None = no mandar el campo."""
        model = self.model.lower()
        setting = self._settings.anthropic_effort

        if "haiku" in model or setting == "default":
            return None, None  # Haiku no admite effort; "default" = no tocar nada

        if setting == "auto":
            if not model.startswith(_EFFORT_MODEL_PREFIXES):
                return None, None  # modelo desconocido: no arriesgar un 400
            effort = "low"
        else:
            effort = setting

        thinking = None
        if model.startswith("claude-sonnet-5-5") and effort in _LOW_EFFORTS:
            thinking = {"type": "between_tools"}
        return thinking, effort

    def build_body(
        self,
        prompt: str,
        image_b64: str,
        schema: dict[str, Any] | None,
        max_tokens: int,
        temperature: float,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{
                "role": "user",
                # La imagen va antes del texto: es lo que recomienda la documentacion.
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}},
                    {"type": "text", "text": prompt},
                ],
            }],
        }

        thinking, effort = self._reasoning_params()
        if thinking:
            body["thinking"] = thinking

        output_config: dict[str, Any] = {}
        if effort:
            output_config["effort"] = effort
        if schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": to_anthropic_schema(schema)}
        if output_config:
            body["output_config"] = output_config

        if "haiku" in self.model.lower():
            body["temperature"] = temperature
        return body

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
    ) -> ModelResult:
        response = await post_json(
            client,
            self.name,
            f"{self._settings.anthropic_base_url}/v1/messages",
            json=self.build_body(prompt, image_b64, schema, max_tokens, temperature),
            headers={
                "x-api-key": self._api_key,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            timeout=self._settings.cloud_timeout_s,
        )
        if response.status_code >= 400:
            raise error_from_response(self.name, response)
        return self.parse_response(response.json())

    @staticmethod
    def parse_response(data: dict[str, Any]) -> ModelResult:
        stop = str(data.get("stop_reason") or "")

        if stop == "refusal":
            category = (data.get("stop_details") or {}).get("category", "sin categoria")
            raise ProviderError(
                502,
                "El servicio de IA no pudo leer esta página.",
                log_detail=f"anthropic rechazo la pagina (stop_reason=refusal, categoria={category})",
            )

        text = "".join(
            block.get("text", "")
            for block in data.get("content") or []
            if isinstance(block, dict) and block.get("type") == "text"
        )
        if not text.strip():
            raise ProviderError(
                502,
                "El servicio de IA devolvió una respuesta vacía.",
                log_detail=f"anthropic respuesta vacia (stop_reason={stop})",
            )

        usage = data.get("usage") or {}
        details = usage.get("output_tokens_details") or {}
        return ModelResult(
            text=text,
            # El pipeline reconoce "length" como salida cortada por limite de tokens.
            finish_reason="length" if stop == "max_tokens" else stop,
            usage={
                "input": int(usage.get("input_tokens") or 0),
                "output": int(usage.get("output_tokens") or 0),
                "thinking": int(details.get("thinking_tokens") or 0),
            },
        )
