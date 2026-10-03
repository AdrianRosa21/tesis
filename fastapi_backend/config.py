"""Configuracion del backend: se lee del entorno (.env) una sola vez y se pasa explicita."""
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]

PIPELINES = ("hybrid", "v4", "v3")
PROVIDERS = ("gemini", "openai", "anthropic")
ANTHROPIC_EFFORTS = ("auto", "default", "low", "medium", "high", "xhigh", "max")


def _text(env: Mapping[str, str], name: str, default: str) -> str:
    value = env.get(name)
    return default if value is None or not value.strip() else value.strip()


def _optional(env: Mapping[str, str], name: str) -> str | None:
    value = env.get(name)
    return value.strip() if value and value.strip() else None


def _number(env: Mapping[str, str], name: str, default: float, cast=float):
    try:
        return cast(_text(env, name, str(default)))
    except ValueError:
        return default


def _choice(env: Mapping[str, str], name: str, default: str, allowed: tuple[str, ...]) -> str:
    value = _text(env, name, default).lower()
    return value if value in allowed else default


@dataclass(frozen=True)
class Settings:
    # Acceso
    api_key: str | None = None
    logs_stream_key: str | None = None

    # Ollama (modelo local: detector y respaldo)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5vl"
    ollama_num_ctx: int = 16384
    ollama_keep_alive: str = "30m"
    warmup: bool = True  # cargar el modelo local al arrancar, en segundo plano

    # Que pipeline corre: hybrid (nube + detector local), v4 o v3 (solo Ollama)
    pipeline: str = "hybrid"
    provider: str = "gemini"
    detector: str = "ollama"  # ollama | off
    # Segundos extra que se espera al detector local DESPUES de que la nube ya respondio. Ollama tarda
    # 5-8 s en clasificar y la nube ~2.5 s: con 5 s de espera cada pagina tardaba ~7.5 s en vez de ~3-4.
    detect_grace_s: float = 1.5
    fallback: str = "ollama"  # ollama | off

    # Proveedores en la nube
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com"
    gemini_thinking: str = "auto"  # auto | off | <presupuesto de tokens>
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5-5"
    anthropic_base_url: str = "https://api.anthropic.com"
    # auto = el valor mas rapido que cada modelo admite; default = no mandar nada (razona como siempre)
    anthropic_effort: str = "auto"
    cloud_timeout_s: float = 60.0

    # Limites y tiempos
    max_followups: int = 1
    time_budget_s: float = 80.0
    max_cache_entries: int = 128
    max_image_mb: int = 5
    rate_limit_per_min: int = 30
    # Tope global de paginas leidas por la nube al dia (0 = sin tope). Protege el saldo: al llegar,
    # AURA sigue funcionando con el respaldo local en vez de seguir gastando.
    cloud_max_pages_per_day: int = 0
    log_file_path: str = "/workspace/aura/logs/backend.log"

    @property
    def cloud_api_key(self) -> str | None:
        return {
            "gemini": self.gemini_api_key,
            "openai": self.openai_api_key,
            "anthropic": self.anthropic_api_key,
        }[self.provider]

    @property
    def cloud_model(self) -> str:
        return {
            "gemini": self.gemini_model,
            "openai": self.openai_model,
            "anthropic": self.anthropic_model,
        }[self.provider]

    @property
    def cloud_ready(self) -> bool:
        return bool(self.cloud_api_key)

    @property
    def effective_pipeline(self) -> str:
        """hybrid sin clave de la nube cae a v4: asi desplegar no cambia nada hasta configurarla."""
        if self.pipeline == "hybrid" and not self.cloud_ready:
            return "v4"
        return self.pipeline

    @property
    def uses_ollama(self) -> bool:
        """False cuando todo el trabajo va a la nube (sin detector ni respaldo local):
        entonces no hace falta que Ollama exista ni que haya GPU."""
        if self.effective_pipeline != "hybrid":
            return True
        return self.detector == "ollama" or self.fallback == "ollama"

    @property
    def prompt_version(self) -> str:
        return {
            "hybrid": "faithful-reader-cloud-v1",
            "v4": "faithful-reader-v4",
            "v3": "faithful-reader-v3",
        }[self.effective_pipeline]

    @property
    def engine_tag(self) -> str:
        """Identifica motor y modelos: forma parte de la clave de la cache."""
        pipeline = self.effective_pipeline
        if pipeline == "hybrid":
            detector = self.ollama_model if self.detector == "ollama" else "sin-detector"
            return f"hybrid:{self.provider}:{self.cloud_model}:{detector}"
        return f"{pipeline}:{self.ollama_model}"

    @property
    def max_bytes(self) -> int:
        return self.max_image_mb * 1024 * 1024


def _pick_provider(env: Mapping[str, str]) -> str:
    """AURA_PROVIDER si es valido; si falta, el primer proveedor que tenga clave.

    Asi, poner solo OPENAI_API_KEY basta: no se queda en silencio usando Ollama por olvidar
    una segunda variable."""
    explicit = _text(env, "AURA_PROVIDER", "").lower()
    if explicit in PROVIDERS:
        return explicit
    for provider, key_name in (
        ("openai", "OPENAI_API_KEY"),
        ("anthropic", "ANTHROPIC_API_KEY"),
        ("gemini", "GEMINI_API_KEY"),
    ):
        if _optional(env, key_name):
            return provider
    return "gemini"


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    if env is None:
        load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
        env = os.environ

    api_key = _optional(env, "API_KEY")
    return Settings(
        api_key=api_key,
        logs_stream_key=_optional(env, "LOGS_STREAM_KEY") or api_key,
        ollama_base_url=_text(env, "OLLAMA_BASE_URL", "http://localhost:11434"),
        ollama_model=_text(env, "OLLAMA_MODEL", "qwen2.5vl"),
        ollama_num_ctx=_number(env, "OLLAMA_NUM_CTX", 16384, int),
        ollama_keep_alive=_text(env, "OLLAMA_KEEP_ALIVE", "30m"),
        warmup=_choice(env, "AURA_WARMUP", "on", ("on", "off")) == "on",
        pipeline=_choice(env, "AURA_PIPELINE", "hybrid", PIPELINES),
        provider=_pick_provider(env),
        detector=_choice(env, "AURA_DETECTOR", "ollama", ("ollama", "off")),
        detect_grace_s=_number(env, "AURA_DETECT_GRACE_S", 1.5),
        fallback=_choice(env, "AURA_FALLBACK", "ollama", ("ollama", "off")),
        gemini_api_key=_optional(env, "GEMINI_API_KEY"),
        gemini_model=_text(env, "GEMINI_MODEL", "gemini-2.5-flash"),
        gemini_base_url=_text(env, "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com").rstrip("/"),
        gemini_thinking=_text(env, "GEMINI_THINKING", "auto").lower(),
        openai_api_key=_optional(env, "OPENAI_API_KEY"),
        openai_model=_text(env, "OPENAI_MODEL", "gpt-4.1-mini"),
        openai_base_url=_text(env, "OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        anthropic_api_key=_optional(env, "ANTHROPIC_API_KEY"),
        anthropic_model=_text(env, "ANTHROPIC_MODEL", "claude-sonnet-5-5"),
        anthropic_base_url=_text(env, "ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/"),
        anthropic_effort=_choice(env, "ANTHROPIC_EFFORT", "auto", ANTHROPIC_EFFORTS),
        cloud_timeout_s=_number(env, "AURA_CLOUD_TIMEOUT_S", 60.0),
        max_followups=_number(env, "AURA_MAX_FOLLOWUPS", 1, int),
        time_budget_s=_number(env, "AURA_TIME_BUDGET_S", 80.0),
        max_cache_entries=_number(env, "MAX_CACHE_ENTRIES", 128, int),
        max_image_mb=_number(env, "MAX_IMAGE_SIZE_MB", 5, int),
        rate_limit_per_min=_number(env, "AURA_RATE_LIMIT_PER_MIN", 30, int),
        cloud_max_pages_per_day=_number(env, "AURA_CLOUD_MAX_PAGES_PER_DAY", 0, int),
        log_file_path=_text(env, "LOG_FILE_PATH", "/workspace/aura/logs/backend.log"),
    )
