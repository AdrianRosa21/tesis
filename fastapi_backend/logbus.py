"""Logger central de AURA: terminal, buffer en memoria, transmision en vivo e historial en disco."""
import asyncio
import logging
import logging.handlers
from collections import deque
from pathlib import Path

LOG_BUFFER_SIZE = 500
log_buffer: deque[str] = deque(maxlen=LOG_BUFFER_SIZE)
log_subscribers: set[asyncio.Queue] = set()


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
_broadcast.setFormatter(logging.Formatter("%(asctime)s | %(message)s", datefmt="%H:%M:%S"))
logger.addHandler(_broadcast)
logger.addHandler(logging.StreamHandler())  # sigue imprimiendo en la terminal tambien

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
        handler.setFormatter(logging.Formatter("%(asctime)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
        logger.addHandler(handler)
        LOG_HISTORY_PATH = history
    except OSError as exc:
        LOG_HISTORY_PATH = None
        print(f"No se pudo abrir el archivo de logs persistente ({path}): {exc}")
    return LOG_HISTORY_PATH
