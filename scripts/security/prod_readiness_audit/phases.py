from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ProdReadinessPhase:
    name: str
    run: Callable[[], None]
