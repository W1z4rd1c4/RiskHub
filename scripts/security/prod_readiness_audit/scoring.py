from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProdReadinessScore:
    blocking_failures: int = 0
    warnings: int = 0
