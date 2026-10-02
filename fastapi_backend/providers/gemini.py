"""Google Gemini (API REST generateContent) con salida JSON estructurada."""
from typing import Any

import httpx

from fastapi_backend.config import Settings
from fastapi_backend.providers.base import ModelResult, ProviderError, error_from_response
from fastapi_backend.providers.http import post_json
from fastapi_backend.schemas import to_gemini_schema

# AURA lee cualquier documento (novelas con violencia, textos medicos...). Un filtro
# de contenido que corte la lectura dejaria a la persona sin la pagina.
_SAFETY_OFF = [
    {"category": category, "threshold": "BLOCK_NONE"}
    for category in (
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
    )
]


class GeminiProvider:
    name = "gemini"

    def __init__(self, settings: Settings):
        self._settings = settings
        self.model = settings.gemini_model
        self._api_key = settings.gemini_api_key or ""

    def _thinking_budget(self) -> int | None:
        """Los modelos 2.5 Flash "piensan" antes de responder y eso gasta tiempo y tokens:
        para transcribir no hace falta. Los demas modelos no aceptan presupuesto 0."""
        setting = self._settings.gemini_thinking
        if setting == "auto":
            return 0 if "2.5-flash" in self.model else None
        if setting in ("off", "none", ""):
            return None
        try:
            return int(setting)
        except ValueError:
            return None

    def build_body(
        self,
        prompt: str,
        image_b64: str,
        schema: dict[str, Any] | None,
        max_tokens: int,
        temperature: float,
    ) -> dict[str, Any]:
        generation: dict[str, Any] = {"temperature": temperature, "maxOutputTokens": max_tokens}
        if schema is not None:
            generation["responseMimeType"] = "application/json"
            generation["responseSchema"] = to_gemini_schema(schema)
        budget = self._thinking_budget()
        if budget is not None:
            generation["thinkingConfig"] = {"thinkingBudget": budget}

        return {
            "contents": [{
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
                    {"text": prompt},
                ],
            }],
            "generationConfig": generation,
            "safetySettings": _SAFETY_OFF,
        }

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
        url = f"{self._settings.gemini_base_url}/v1beta/models/{self.model}:generateContent"
        response = await post_json(
            client,
            self.name,
            url,
            json=self.build_body(prompt, image_b64, schema, max_tokens, temperature),
            headers={"x-goog-api-key": self._api_key, "Content-Type": "application/json"},
            timeout=self._settings.cloud_timeout_s,
        )
        if response.status_code >= 400:
            raise error_from_response(self.name, response)
        return self.parse_response(response.json())

    @staticmethod
    def parse_response(data: dict[str, Any]) -> ModelResult:
        candidates = data.get("candidates") or []
        if not candidates:
            reason = (data.get("promptFeedback") or {}).get("blockReason", "sin candidatos")
            raise ProviderError(
                502,
                "El servicio de IA no devolvió contenido para esta página.",
                log_detail=f"gemini sin candidatos ({reason})",
            )

        candidate = candidates[0]
        parts = (candidate.get("content") or {}).get("parts") or []
        text = "".join(
            part.get("text", "") for part in parts if isinstance(part, dict) and not part.get("thought")
        )
        finish = str(candidate.get("finishReason", ""))
        usage = data.get("usageMetadata") or {}

        if not text.strip():
            raise ProviderError(
                502,
                "El servicio de IA devolvió una respuesta vacía.",
                log_detail=f"gemini respuesta vacia (finishReason={finish})",
            )

        return ModelResult(
            text=text,
            finish_reason=finish,
            usage={
                "input": int(usage.get("promptTokenCount") or 0),
                "output": int(usage.get("candidatesTokenCount") or 0),
                "thinking": int(usage.get("thoughtsTokenCount") or 0),
            },
        )
