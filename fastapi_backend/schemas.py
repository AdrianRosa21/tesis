"""Esquemas JSON de la salida estructurada, con la adaptacion que pide cada proveedor."""
import copy
from typing import Any

from fastapi_backend.prompts import EXTRACT_SCHEMA

# Para la nube se agrega "idioma" por bloque. El esquema de Ollama no cambia.
EXTRACT_SCHEMA_CLOUD: dict[str, Any] = copy.deepcopy(EXTRACT_SCHEMA)
EXTRACT_SCHEMA_CLOUD["properties"]["bloques"]["items"]["properties"]["idioma"] = {"type": "string"}

# Subconjunto de JSON Schema que acepta responseSchema de Gemini.
_GEMINI_KEYS = {
    "type", "format", "description", "nullable", "enum", "items",
    "properties", "required", "minItems", "maxItems", "propertyOrdering",
}


def to_gemini_schema(schema: Any) -> Any:
    """Gemini usa tipos en mayuscula (STRING, OBJECT...) y rechaza palabras clave que no conoce."""
    if isinstance(schema, list):
        return [to_gemini_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    converted: dict[str, Any] = {}
    for key, value in schema.items():
        if key not in _GEMINI_KEYS:
            continue
        if key == "type" and isinstance(value, str):
            converted[key] = value.upper()
        elif key == "properties" and isinstance(value, dict):
            converted[key] = {name: to_gemini_schema(sub) for name, sub in value.items()}
        else:
            converted[key] = to_gemini_schema(value)
    return converted
