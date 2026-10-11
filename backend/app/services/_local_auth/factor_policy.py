"""Ordinary native factor policy, independent of account eligibility and proof validity."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


class FactorState(Protocol):
    @property
    def confirmed_at(self) -> datetime | None: ...


@dataclass(frozen=True)
class FactorPolicy:
    confirmed: bool
    required: bool

    @property
    def enrollment_completes_without_factor(self) -> bool:
        """The validated enrollment step may complete; this grants no account authority."""
        return not self.required

    @property
    def satisfied(self) -> bool:
        return not self.required or self.confirmed


def evaluate_factor_policy(policy: str, factor: FactorState | None) -> FactorPolicy:
    if policy not in {"required", "optional"}:
        raise ValueError("Unknown MFA policy")
    confirmed = factor is not None and factor.confirmed_at is not None
    return FactorPolicy(confirmed=confirmed, required=policy == "required" or confirmed)
