from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProdReadinessCommand:
    command_id: str
    command: str
    required: bool = True
