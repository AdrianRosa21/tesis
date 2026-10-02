"""Fabrica de proveedores segun la configuracion."""
from fastapi_backend.config import Settings
from fastapi_backend.providers.base import ModelResult, ProviderError, VisionProvider
from fastapi_backend.providers.gemini import GeminiProvider
from fastapi_backend.providers.ollama import OllamaProvider
from fastapi_backend.providers.openai_chat import OpenAIProvider

__all__ = [
    "GeminiProvider",
    "ModelResult",
    "OllamaProvider",
    "OpenAIProvider",
    "ProviderError",
    "VisionProvider",
    "build_cloud_provider",
    "build_local_provider",
]


def build_local_provider(settings: Settings) -> OllamaProvider:
    return OllamaProvider(settings)


def build_cloud_provider(settings: Settings) -> VisionProvider | None:
    """Proveedor de la nube elegido, o None si falta su clave."""
    if not settings.cloud_ready:
        return None
    if settings.provider == "gemini":
        return GeminiProvider(settings)
    return OpenAIProvider(settings)
