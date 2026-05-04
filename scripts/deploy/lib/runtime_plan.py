from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DeployRuntimeCommandPlan:
    command_id: str
    command: str
    mutates_filesystem: bool = False
