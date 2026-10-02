"""Ollama: modelo de vision local. Detecta el tipo de pagina y sirve de respaldo."""
from typing import Any

import httpx

from fastapi_backend.config import Settings
from fastapi_backend.providers.base import ModelResult


class OllamaProvider:
    name = "ollama"

    def __init__(self, settings: Settings):
        self._settings = settings
        self.model = settings.ollama_model

    async def warm_up(self, client: httpx.AsyncClient) -> None:
        """Carga el modelo en la GPU sin generar texto. Sin esto, la primera pagina despues
        de encender el pod pagaba la carga del modelo (~85 s) y casi llegaba al corte de Cloudflare."""
        response = await client.post(
            f"{self._settings.ollama_base_url}/api/generate",
            json={"model": self.model, "keep_alive": self._settings.ollama_keep_alive},
            timeout=300.0,
        )
        response.raise_for_status()

    async def generate(
        self,
        client: httpx.AsyncClient,
        prompt: str,
        image_b64: str,
        *,
        schema: dict[str, Any] | None = None,
        max_tokens: int = 1600,
        temperature: float = 0.0,
        repeat_penalty: float | None = None,
    ) -> ModelResult:
        settings = self._settings
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt, "images": [image_b64]}],
            "stream": False,
            "keep_alive": settings.ollama_keep_alive,
            "options": {
                "temperature": temperature,
                "top_p": 0.1,
                "repeat_penalty": 1.05 if repeat_penalty is None else repeat_penalty,
                "num_ctx": settings.ollama_num_ctx,
                "num_predict": max_tokens,
            },
        }
        if schema is not None:
            payload["format"] = schema
        response = await client.post(f"{settings.ollama_base_url}/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
        return ModelResult(
            text=data.get("message", {}).get("content", ""),
            finish_reason=str(data.get("done_reason", "")),
            usage={
                "input": int(data.get("prompt_eval_count") or 0),
                "output": int(data.get("eval_count") or 0),
            },
        )
