"""OpenAI (Chat Completions) con imagen y salida JSON estructurada."""
from typing import Any

import httpx

from fastapi_backend.config import Settings
from fastapi_backend.providers.base import ModelResult, ProviderError, error_from_response
from fastapi_backend.providers.http import post_json

# Los modelos de razonamiento (gpt-5, o1, o3...) solo aceptan la temperatura por defecto.
_FIXED_TEMPERATURE_PREFIXES = ("gpt-5", "o1", "o3", "o4")


class OpenAIProvider:
    name = "openai"

    def __init__(self, settings: Settings):
        self._settings = settings
        self.model = settings.openai_model
        self._api_key = settings.openai_api_key or ""

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
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}", "detail": "high"},
                    },
                ],
            }],
            "max_completion_tokens": max_tokens,
        }
        if not self.model.lower().startswith(_FIXED_TEMPERATURE_PREFIXES):
            body["temperature"] = temperature
        if schema is not None:
            # strict=False: el esquema tiene campos opcionales (encabezados, filas...).
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "aura_page", "schema": schema, "strict": False},
            }
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
            f"{self._settings.openai_base_url}/chat/completions",
            json=self.build_body(prompt, image_b64, schema, max_tokens, temperature),
            headers={"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"},
            timeout=self._settings.cloud_timeout_s,
        )
        if response.status_code >= 400:
            raise error_from_response(self.name, response)
        return self.parse_response(response.json())

    @staticmethod
    def parse_response(data: dict[str, Any]) -> ModelResult:
        choices = data.get("choices") or []
        if not choices:
            raise ProviderError(
                502,
                "El servicio de IA no devolvió contenido para esta página.",
                log_detail="openai sin choices",
            )

        choice = choices[0]
        message = choice.get("message") or {}
        text = message.get("content") or ""
        finish = str(choice.get("finish_reason", ""))
        usage = data.get("usage") or {}

        if not text.strip():
            refusal = message.get("refusal") or ""
            raise ProviderError(
                502,
                "El servicio de IA devolvió una respuesta vacía.",
                log_detail=f"openai respuesta vacia (finish_reason={finish}, refusal={refusal[:120]})",
            )

        return ModelResult(
            text=text,
            finish_reason=finish,
            usage={
                "input": int(usage.get("prompt_tokens") or 0),
                "output": int(usage.get("completion_tokens") or 0),
            },
        )
