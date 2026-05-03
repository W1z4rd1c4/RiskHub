from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.permissions import get_user_department_ids
from app.core.snapshot_service import get_quarter_label
from app.models import User
from app.services._quarterly_comparison.changes import calculate_changes
from app.services._quarterly_comparison.period_metrics import get_quarter_period_metrics
from app.services._quarterly_comparison.periods import calculate_quarter_boundaries, validate_quarter_selection
from app.services._quarterly_comparison.snapshots import (
    resolve_snapshot_department_id,
    resolve_snapshot_metrics,
)

PERIOD_METRICS = [
    "new_risks",
    "archived_risks",
    "audit_activity",
    "failed_audits",
    "unaudited_controls",
    "activity_volume",
]

SNAPSHOT_METRICS = [
    "priority_risks",
    "kri_breaches",
    "pending_approvals",
    "control_coverage",
    "orphaned_items",
    "kri_health",
    "overdue_kris",
    "risks_without_kri",
    "active_risks",
    "active_vendors",
]


@dataclass(frozen=True)
class SnapshotSourceDecision:
    current: str
    compare: str


@dataclass(frozen=True)
class MetricAvailability:
    period_metrics: list[str]
    snapshot_metrics: list[str]
    missing_current_snapshot_metrics: list[str]
    missing_compare_snapshot_metrics: list[str]


@dataclass(frozen=True)
class QuarterMetricComposition:
    this_quarter: dict
    last_quarter: dict
    changes: dict
    period: dict
    snapshot_info: dict

    def as_response(self) -> dict:
        return {
            "this_quarter": self.this_quarter,
            "last_quarter": self.last_quarter,
            "changes": self.changes,
            "period": self.period,
            "snapshot_info": self.snapshot_info,
        }


async def build_quarterly_comparison(
    db: AsyncSession,
    current_user: User,
    current_quarter: Optional[str] = None,
    compare_quarter: Optional[str] = None,
) -> dict:
    now = utc_now()
    dept_ids = get_user_department_ids(current_user)

    (
        current_quarter_start,
        current_quarter_end,
        last_quarter_start,
        last_quarter_end,
    ) = calculate_quarter_boundaries(now, current_quarter, compare_quarter)
    validate_quarter_selection(now, current_quarter_start, last_quarter_start)
    effective_current_quarter_end = min(current_quarter_end, now)

    this_quarter_period = await get_quarter_period_metrics(
        db, current_quarter_start, effective_current_quarter_end, dept_ids
    )
    last_quarter_period = await get_quarter_period_metrics(db, last_quarter_start, last_quarter_end, dept_ids)

    last_quarter_label = get_quarter_label(last_quarter_start)
    selected_current_quarter_label = get_quarter_label(current_quarter_start)
    actual_current_quarter_label = get_quarter_label(now)

    snapshot_department_id = resolve_snapshot_department_id(dept_ids)
    is_live_current_quarter = selected_current_quarter_label == actual_current_quarter_label

    current_snapshot, current_snapshot_source = await resolve_snapshot_metrics(
        db,
        quarter_label=selected_current_quarter_label,
        is_live_current_quarter=is_live_current_quarter,
        dept_ids=dept_ids,
        snapshot_department_id=snapshot_department_id,
    )
    last_quarter_snapshot, last_quarter_snapshot_source = await resolve_snapshot_metrics(
        db,
        quarter_label=last_quarter_label,
        is_live_current_quarter=False,
        dept_ids=dept_ids,
        snapshot_department_id=snapshot_department_id,
    )

    this_quarter_combined = {**this_quarter_period, **current_snapshot}
    last_quarter_combined = {**last_quarter_period, **last_quarter_snapshot}

    missing_snapshot_quarters = []
    if current_snapshot_source == "missing":
        missing_snapshot_quarters.append(selected_current_quarter_label)
    if last_quarter_snapshot_source == "missing":
        missing_snapshot_quarters.append(last_quarter_label)

    missing_current_snapshot_metrics = {metric for metric in SNAPSHOT_METRICS if metric not in current_snapshot}
    missing_compare_snapshot_metrics = {metric for metric in SNAPSHOT_METRICS if metric not in last_quarter_snapshot}
    unavailable_snapshot_metrics = missing_current_snapshot_metrics | missing_compare_snapshot_metrics

    changes = calculate_changes(this_quarter_combined, last_quarter_combined, unavailable_snapshot_metrics)

    composition = QuarterMetricComposition(
        this_quarter=this_quarter_combined,
        last_quarter=last_quarter_combined,
        changes=changes,
        period={
            "this_start": current_quarter_start.isoformat(),
            "this_end": effective_current_quarter_end.isoformat(),
            "last_start": last_quarter_start.isoformat(),
            "last_end": last_quarter_end.isoformat(),
        },
        snapshot_info={
            "current_quarter": selected_current_quarter_label,
            "last_quarter": last_quarter_label,
            "last_quarter_snapshot_available": last_quarter_snapshot_source != "missing",
            "current_quarter_snapshot_available": current_snapshot_source != "missing",
            "missing_snapshot_quarters": missing_snapshot_quarters,
            "snapshot_sources": SnapshotSourceDecision(
                current=current_snapshot_source,
                compare=last_quarter_snapshot_source,
            ).__dict__,
            "missing_snapshot_metrics": {
                "current": sorted(missing_current_snapshot_metrics),
                "compare": sorted(missing_compare_snapshot_metrics),
            },
            "period_metrics": PERIOD_METRICS,
            "snapshot_metrics": SNAPSHOT_METRICS,
        },
    )
    return composition.as_response()
