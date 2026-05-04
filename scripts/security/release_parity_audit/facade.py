from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ReleaseParityFacadePlan:
    phases: list[str]
    facts: dict[str, Any]


def build_release_parity_facade_plan(*, phases: list[str], facts: dict[str, Any]) -> ReleaseParityFacadePlan:
    return ReleaseParityFacadePlan(phases=list(phases), facts=dict(facts))
