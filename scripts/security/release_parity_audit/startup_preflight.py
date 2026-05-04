from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class StartupPreflightSnapshot:
    data: dict[str, Any]


def build_startup_preflight_snapshot(data: dict[str, Any]) -> StartupPreflightSnapshot:
    return StartupPreflightSnapshot(data=dict(data))
