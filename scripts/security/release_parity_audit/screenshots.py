from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScreenshotCapturePlan:
    command_id: str
    command: str


def build_screenshot_capture_plan(*, command_id: str, command: str) -> ScreenshotCapturePlan:
    return ScreenshotCapturePlan(command_id=command_id, command=command)
