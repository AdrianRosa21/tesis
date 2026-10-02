"""Limite de peticiones por cliente (ventana deslizante en memoria)."""
import time
from collections import defaultdict, deque
from collections.abc import Callable


class RateLimiter:
    def __init__(
        self,
        max_per_window: int,
        window_s: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.max_per_window = max_per_window
        self.window_s = window_s
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> float | None:
        """Registra una peticion. Devuelve None si pasa, o los segundos que debe esperar."""
        if self.max_per_window <= 0:
            return None

        now = self._clock()
        hits = self._hits[key]
        while hits and now - hits[0] >= self.window_s:
            hits.popleft()

        if len(hits) >= self.max_per_window:
            return max(0.0, self.window_s - (now - hits[0]))

        hits.append(now)
        if len(self._hits) > 2000:
            self._purge(now)
        return None

    def _purge(self, now: float) -> None:
        for key in [k for k, hits in self._hits.items() if not hits or now - hits[-1] >= self.window_s]:
            del self._hits[key]
