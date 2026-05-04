from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CleanupCommand:
    command_id: str
    command: str


def build_cleanup_command(*, command_id: str, command: str) -> CleanupCommand:
    return CleanupCommand(command_id=command_id, command=command)
