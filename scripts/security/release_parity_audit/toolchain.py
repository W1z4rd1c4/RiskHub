from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ToolchainSnapshot:
    data: dict[str, Any]
