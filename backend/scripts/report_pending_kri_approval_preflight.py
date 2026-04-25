from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

from sqlalchemy import select

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus, KeyRiskIndicator
from app.services._kri_history.periods import (
    due_date,
    is_period_end_boundary,
    latest_closed_period_for_date,
)

PENDING_KRI_STATUSES = (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)


@dataclass
class PendingKriApprovalFinding:
    approval_id: int
    approval_status: str
    resource_id: int
    resource_name: str
    metric_name: str | None
    frequency: str | None
    period_end: str | None
    reason_codes: list[str]


def inspect_pending_kri_value_approval(
    approval: ApprovalRequest,
    kri: KeyRiskIndicator | None,
    *,
    today: date,
) -> PendingKriApprovalFinding | None:
    changes = approval.pending_changes or {}
    if "current_value" not in changes or "period_end" not in changes:
        return None

    reasons: list[str] = []
    period_end_raw = changes.get("period_end")
    period_end: date | None = None

    if kri is None:
        reasons.append("missing_target")
    if not isinstance(period_end_raw, str):
        reasons.append("invalid_period_end_format")
    else:
        try:
            period_end = date.fromisoformat(period_end_raw)
        except ValueError:
            reasons.append("invalid_period_end_format")

    if kri is not None and period_end is not None:
        _, latest_closed_end = latest_closed_period_for_date(today, kri.frequency)
        if period_end > today:
            reasons.append("future_period")
        elif not is_period_end_boundary(period_end, kri.frequency):
            reasons.append("invalid_period_boundary")
        else:
            if period_end < latest_closed_end:
                reasons.append("backdated_closed_period")
            if today > due_date(period_end):
                reasons.append("reporting_window_closed")

    if not reasons:
        return None

    return PendingKriApprovalFinding(
        approval_id=approval.id,
        approval_status=approval.status.value.lower(),
        resource_id=approval.resource_id,
        resource_name=approval.resource_name,
        metric_name=kri.metric_name if kri is not None else None,
        frequency=kri.frequency if kri is not None else None,
        period_end=period_end.isoformat() if period_end is not None else None,
        reason_codes=reasons,
    )


def build_pending_kri_approval_report(
    rows: list[tuple[ApprovalRequest, KeyRiskIndicator | None]],
    *,
    today: date,
) -> dict[str, Any]:
    findings = [
        finding
        for approval, kri in rows
        if (finding := inspect_pending_kri_value_approval(approval, kri, today=today)) is not None
    ]
    return {
        "generated_at": utc_now().isoformat(),
        "today": today.isoformat(),
        "scanned_pending_kri_approvals": len(rows),
        "flagged_count": len(findings),
        "flagged_approvals": [asdict(finding) for finding in findings],
    }


async def _load_pending_kri_rows() -> list[tuple[ApprovalRequest, KeyRiskIndicator | None]]:
    settings = get_settings()
    async with session_context(settings) as session:
        result = await session.execute(
            select(ApprovalRequest, KeyRiskIndicator)
            .outerjoin(KeyRiskIndicator, KeyRiskIndicator.id == ApprovalRequest.resource_id)
            .where(
                ApprovalRequest.resource_type == ApprovalResourceType.KRI,
                ApprovalRequest.action_type == ApprovalActionType.EDIT,
                ApprovalRequest.status.in_(PENDING_KRI_STATUSES),
            )
            .order_by(ApprovalRequest.id.asc())
        )
        return list(result.all())


async def _run() -> None:
    parser = argparse.ArgumentParser(
        description="Report pending KRI approval requests that would fail under apply-time validation."
    )
    parser.add_argument(
        "--output",
        default="-",
        help="Write the JSON report to this path instead of stdout.",
    )
    args = parser.parse_args()

    rows = await _load_pending_kri_rows()
    report = build_pending_kri_approval_report(rows, today=utc_now().date())
    payload = json.dumps(report, indent=2, sort_keys=True)

    if args.output == "-":
        print(payload)
        return

    with open(args.output, "w", encoding="utf-8") as handle:
        handle.write(payload)
        handle.write("\n")


if __name__ == "__main__":
    import asyncio

    asyncio.run(_run())
