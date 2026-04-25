from __future__ import annotations

from datetime import date

from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus, KeyRiskIndicator
from app.models.key_risk_indicator import KRIFrequency
from scripts.report_pending_kri_approval_preflight import (
    build_pending_kri_approval_report,
    inspect_pending_kri_value_approval,
)


def _approval(*, approval_id: int, period_end: str, status: ApprovalStatus = ApprovalStatus.PENDING) -> ApprovalRequest:
    return ApprovalRequest(
        id=approval_id,
        resource_type=ApprovalResourceType.KRI,
        resource_id=approval_id,
        resource_name=f"KRI {approval_id}",
        requested_by_id=1,
        reason="Queued KRI value submission",
        action_type=ApprovalActionType.EDIT,
        status=status,
        pending_changes={
            "current_value": {"old": 30.0, "new": 55.0},
            "period_end": period_end,
        },
    )


def _kri(*, kri_id: int, frequency: str = KRIFrequency.monthly.value) -> KeyRiskIndicator:
    return KeyRiskIndicator(
        id=kri_id,
        risk_id=1,
        metric_name=f"KRI {kri_id}",
        description="desc",
        current_value=30.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=frequency,
    )


def test_inspect_pending_kri_value_approval_returns_none_when_still_valid() -> None:
    finding = inspect_pending_kri_value_approval(
        _approval(approval_id=1, period_end="2026-03-31"),
        _kri(kri_id=1),
        today=date(2026, 4, 10),
    )

    assert finding is None


def test_inspect_pending_kri_value_approval_flags_stale_backdated_period() -> None:
    finding = inspect_pending_kri_value_approval(
        _approval(approval_id=2, period_end="2026-02-28"),
        _kri(kri_id=2),
        today=date(2026, 4, 20),
    )

    assert finding is not None
    assert "backdated_closed_period" in finding.reason_codes
    assert "reporting_window_closed" in finding.reason_codes


def test_build_pending_kri_approval_report_includes_missing_targets() -> None:
    report = build_pending_kri_approval_report(
        [
            (_approval(approval_id=3, period_end="2026-03-31"), None),
            (_approval(approval_id=4, period_end="2026-03-31"), _kri(kri_id=4)),
        ],
        today=date(2026, 4, 10),
    )

    assert report["scanned_pending_kri_approvals"] == 2
    assert report["flagged_count"] == 1
    assert report["flagged_approvals"][0]["approval_id"] == 3
    assert report["flagged_approvals"][0]["reason_codes"] == ["missing_target"]
