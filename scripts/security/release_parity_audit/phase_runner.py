from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class ReleaseParityPhase:
    name: str
    execute: Callable[[], None]


class ReleaseParityPhaseRunner:
    def run(self, phases: Iterable[ReleaseParityPhase]) -> None:
        for phase in phases:
            phase.execute()

