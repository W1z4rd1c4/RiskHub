from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.models import ApprovalRequest, ApprovalStatus


class SideEffectOutcome(str, Enum):
    APPLIED = "applied"
    AUTO_REJECTED = "auto_rejected"


@dataclass(frozen=True)
class SideEffectResult:
    outcome: SideEffectOutcome
    reason: str | None = None

    @classmethod
    def applied(cls) -> "SideEffectResult":
        return cls(outcome=SideEffectOutcome.APPLIED)

    @classmethod
    def auto_rejected(cls, reason: str) -> "SideEffectResult":
        return cls(outcome=SideEffectOutcome.AUTO_REJECTED, reason=reason)


def auto_reject_kri_approval(approval: ApprovalRequest, reason: str) -> SideEffectResult:
    return SideEffectResult.auto_rejected(reason)


def apply_auto_rejection(approval: ApprovalRequest, result: SideEffectResult) -> None:
    if result.outcome != SideEffectOutcome.AUTO_REJECTED:
        return
    if result.reason is None:
        raise ValueError("Auto-rejected side-effect results require a reason")
    approval.status = ApprovalStatus.REJECTED
    approval.resolution_notes = (
        (approval.resolution_notes or "").rstrip() + f"\nAuto-rejected: {result.reason}"
    ).strip()
