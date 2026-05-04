from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CleanupCommand:
    command_id: str
    command: str
