"""Tope diario de paginas leidas por la nube, para no gastar el saldo sin querer."""
import time
from collections.abc import Callable


class CloudBudget:
    """Cuenta las paginas enviadas a la nube en el dia (UTC). Vive en memoria: se reinicia
    con el backend, pero el tope sigue protegiendo mientras el proceso este encendido."""

    def __init__(self, max_per_day: int, clock: Callable[[], float] = time.time):
        self.max_per_day = max_per_day
        self._clock = clock
        self._day = self._today()
        self._used = 0

    def _today(self) -> tuple[int, int, int]:
        return tuple(time.gmtime(self._clock())[:3])  # (anio, mes, dia) en UTC

    def _roll_day(self) -> None:
        today = self._today()
        if today != self._day:
            self._day = today
            self._used = 0

    @property
    def used_today(self) -> int:
        self._roll_day()
        return self._used

    def try_acquire(self) -> bool:
        """True si todavia hay cupo (y lo consume). Con max_per_day <= 0 no hay tope."""
        self._roll_day()
        if self.max_per_day <= 0:
            self._used += 1
            return True
        if self._used >= self.max_per_day:
            return False
        self._used += 1
        return True
