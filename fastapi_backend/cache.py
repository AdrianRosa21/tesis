"""Cache LRU de respuestas, acotada para que un proceso de larga duracion no agote la RAM."""
import hashlib
from collections import OrderedDict
from typing import Any

from fastapi_backend.prompts import MAX_CONTEXT_CHARS


def build_cache_key(
    base64_data: str,
    context: str | None,
    engine_tag: str = "default",
    prompt_version: str = "faithful-reader",
) -> str:
    """La clave depende de la imagen, del texto auxiliar, del motor/modelo y de la version
    del prompt: si cambia cualquiera, la pagina se vuelve a analizar."""
    normalized_context = (context or "").strip()[:MAX_CONTEXT_CHARS]
    material = f"{prompt_version}\0{engine_tag}\0{normalized_context}\0{base64_data}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


class ResponseCache:
    def __init__(self, max_entries: int):
        self._max_entries = max_entries
        self._data: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def get(self, key: str) -> dict[str, Any] | None:
        value = self._data.get(key)
        if value is not None:
            self._data.move_to_end(key)
        return value

    def put(self, key: str, value: dict[str, Any]) -> None:
        self._data[key] = value
        self._data.move_to_end(key)
        while len(self._data) > self._max_entries:
            self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)
