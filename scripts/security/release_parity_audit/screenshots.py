from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScreenshotCapturePlan:
    command_id: str
    command: str
