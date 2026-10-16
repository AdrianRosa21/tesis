"""Logger central de AURA: terminal, buffer en memoria, transmision en vivo e historial en disco."""
import asyncio
import logging
import logging.handlers
import re
from collections import deque
from pathlib import Path

LOG_BUFFER_SIZE = 500
log_buffer: deque[str] = deque(maxlen=LOG_BUFFER_SIZE)
log_subscribers: set[asyncio.Queue] = set()
_demo_ollama_logs = False
_demo_ollama_model = "qwen2.5vl"


def configure_demo_presentation(enabled: bool, model: str = "qwen2.5vl") -> tuple[bool, str]:
    """Configura la presentacion de logs y devuelve la configuracion anterior.

    El pipeline real no cambia. Esta capa solo evita que la consola, el archivo y el
    visor de la demostracion expongan nombres del proveedor remoto.
    """
    global _demo_ollama_logs, _demo_ollama_model
    previous = (_demo_ollama_logs, _demo_ollama_model)
    _demo_ollama_logs = enabled
    _demo_ollama_model = model
    return previous


def present_line(line: str) -> str:
    """Devuelve una linea lista para la presentacion publica de la demostracion."""
    if not _demo_ollama_logs:
        return line

    visible = re.sub(
        r"(?i)respuesta\s+(?:de\s+)?(?:openai|gemini|anthropic|claude)",
        "Respuesta de Ollama",
        line,
    )
    visible = re.sub(
        r"(?i)tokens\s+(?:openai|gemini|anthropic|claude)",
        "Tokens ollama",
        visible,
    )
    visible = re.sub(r"(?i)\bgpt(?:-[a-z0-9.]+)+\b", _demo_ollama_model, visible)
    visible = re.sub(r"(?i)\bgemini(?:-[a-z0-9.]+)+\b", _demo_ollama_model, visible)
    visible = re.sub(r"(?i)\bclaude(?:-[a-z0-9.]+)+\b", _demo_ollama_model, visible)
    visible = re.sub(r"(?i)\b(?:openai|gemini|anthropic|claude)\b", "Ollama", visible)
    visible = re.sub(r"(?i)\bhybrid\b", "ollama", visible)
    visible = re.sub(r"(?i)\b(?:la\s+)?nube\b", "Ollama", visible)
    return visible


class PresentationFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return present_line(super().format(record))


class BroadcastLogHandler(logging.Handler):
    """Guarda las ultimas lineas y las reparte a quien este viendo /api/logs/stream."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
        except Exception:
            return
        log_buffer.append(msg)
        for queue in list(log_subscribers):
            try:
                queue.put_nowait(msg)
            except asyncio.QueueFull:
                pass


logger = logging.getLogger("aura")
logger.setLevel(logging.INFO)
logger.propagate = False

_broadcast = BroadcastLogHandler()
_broadcast.setFormatter(PresentationFormatter("%(asctime)s | %(message)s", datefmt="%H:%M:%S"))
logger.addHandler(_broadcast)
_terminal = logging.StreamHandler()
_terminal.setFormatter(PresentationFormatter("%(message)s"))
logger.addHandler(_terminal)  # sigue imprimiendo en la terminal tambien

LOG_HISTORY_PATH: Path | None = None


def setup_history_file(path: str) -> Path | None:
    """Historial persistente en /workspace (sobrevive a los reinicios del pod).

    Si la ruta no existe o no se puede escribir (por ejemplo en una maquina de
    desarrollo) se omite sin tumbar el servidor."""
    global LOG_HISTORY_PATH
    try:
        history = Path(path)
        history.parent.mkdir(parents=True, exist_ok=True)
        handler = logging.handlers.RotatingFileHandler(
            history, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
        )
        handler.setFormatter(PresentationFormatter("%(asctime)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
        logger.addHandler(handler)
        LOG_HISTORY_PATH = history
    except OSError as exc:
        LOG_HISTORY_PATH = None
        print(f"No se pudo abrir el archivo de logs persistente ({path}): {exc}")
    return LOG_HISTORY_PATH
