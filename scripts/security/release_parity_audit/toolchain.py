from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ToolchainSnapshot:
    data: dict[str, Any]


def build_toolchain_snapshot(data: dict[str, Any]) -> ToolchainSnapshot:
    return ToolchainSnapshot(data=dict(data))
