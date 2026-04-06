from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CommandResult:
    command_id: str
    command: str
    cwd: str
    required: bool
    rc: int
    start_utc: str
    end_utc: str
    duration_sec: float
    log_path: str
    timeout_sec: int | None

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.command_id,
            "command": self.command,
            "cwd": self.cwd,
            "required": self.required,
            "rc": self.rc,
            "start_utc": self.start_utc,
            "end_utc": self.end_utc,
            "duration_sec": self.duration_sec,
            "log": self.log_path,
            "timeout_sec": self.timeout_sec,
        }
