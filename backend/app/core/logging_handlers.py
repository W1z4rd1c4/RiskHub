from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LoggingHandlerPlan:
    name: str
