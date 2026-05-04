from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RuntimeFingerprint:
    data: dict[str, Any]


def build_runtime_fingerprint(data: dict[str, Any]) -> RuntimeFingerprint:
    return RuntimeFingerprint(data=dict(data))
