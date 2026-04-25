"""
Quarterly comparison service for Risk Committee dashboard.

Extracted from dashboard.py to improve readability and testability.
This service computes period-based metrics (events that happened within a quarter)
while snapshot-based metrics are handled by snapshot_service.py.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Literal, Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.permissions import get_user_department_ids
from app.core.snapshot_service import (
    capture_snapshot_metrics,
    get_quarter_label,
    get_quarter_snapshot,
)
from app.models import Control, Risk, User
from app.models.activity_log import ActivityLog
from app.models.control import ControlStatus
from app.models.control_execution import ControlExecution, ExecutionResult
from app.models.risk import RiskStatus

logger = logging.getLogger(__name__)

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


def parse_quarter(quarter_str: str) -> datetime:
    """
    Parse a quarter string like '2026-Q1' into a datetime for the quarter start.

    Args:
        quarter_str: Quarter in 'YYYY-QN' format (e.g., '2026-Q1')

    Returns:
        Timezone-aware UTC datetime for the first day of the quarter

    Raises:
        ValueError: If the quarter format is invalid
    """
    match = re.match(r"^(\d{4})-Q([1-4])$", quarter_str)
    if not match:
        raise ValueError(f"Invalid quarter format: {quarter_str}. Expected 'YYYY-QN' (e.g., '2026-Q1')")
    year = int(match.group(1))
    quarter = int(match.group(2))
    month = (quarter - 1) * 3 + 1
    return datetime(year, month, 1, tzinfo=timezone.utc)


def calculate_quarter_boundaries(
    now: datetime,
    current_quarter: Optional[str] = None,
    compare_quarter: Optional[str] = None,
) -> tuple[datetime, datetime, datetime, datetime]:
    """
    Calculate quarter boundaries for comparison.

    Uses end-exclusive semantics: [start, end)
    For in-progress current quarter, end is 'now'.

    Args:
        now: Current UTC datetime (timezone-aware)
        current_quarter: Optional quarter string (e.g., '2026-Q1')
        compare_quarter: Optional comparison quarter string

    Returns:
        Tuple of (current_quarter_start, current_quarter_end,
                  last_quarter_start, last_quarter_end)
    """
    if current_quarter:
        current_quarter_start = parse_quarter(current_quarter)
        current_quarter_end = current_quarter_start + relativedelta(months=3)
        # If current quarter is the actual current quarter, use now as end
        actual_current_quarter_start = datetime(now.year, ((now.month - 1) // 3) * 3 + 1, 1, tzinfo=timezone.utc)
        if current_quarter_start == actual_current_quarter_start:
            current_quarter_end = now  # Use current time for in-progress quarter
    else:
        current_quarter_start = datetime(now.year, ((now.month - 1) // 3) * 3 + 1, 1, tzinfo=timezone.utc)
        current_quarter_end = now  # Use current time for in-progress quarter

    if compare_quarter:
        last_quarter_start = parse_quarter(compare_quarter)
        last_quarter_end = last_quarter_start + relativedelta(months=3)
    else:
        last_quarter_start = current_quarter_start - relativedelta(months=3)
        # last_quarter_end is current_quarter_start (exclusive upper bound)
        last_quarter_end = current_quarter_start

    return current_quarter_start, current_quarter_end, last_quarter_start, last_quarter_end


def validate_quarter_selection(
    now: datetime,
    current_quarter_start: datetime,
    last_quarter_start: datetime,
) -> None:
    actual_current_quarter_start = datetime(now.year, ((now.month - 1) // 3) * 3 + 1, 1, tzinfo=timezone.utc)
    if current_quarter_start > actual_current_quarter_start:
        raise ValueError("current_quarter cannot be in the future")
    if last_quarter_start >= current_quarter_start:
        raise ValueError("compare_quarter must be before current_quarter")


async def get_quarter_period_metrics(
    db: AsyncSession,
    start: datetime,
    end: datetime,
    dept_ids: Optional[list[int]],
) -> dict:
    """
    Get period-based metrics for a quarter.

    These are metrics that count events occurring within the period [start, end).
    Snapshot-based metrics (point-in-time state) are handled separately.

    Returns only the 6 period-based metrics:
        - new_risks: Risks created in period
        - archived_risks: Risks archived in period
        - audit_activity: Control executions in period
        - failed_audits: Failed control executions in period
        - unaudited_controls: Active controls with no executions in period
        - activity_volume: Activity log entries in period
    """
    # Risks created in period (end-exclusive: [start, end))
    risk_conditions = [
        Risk.created_at >= start,
        Risk.created_at < end,
        Risk.status != RiskStatus.archived.value,
    ]
    if dept_ids is not None:
        risk_conditions.append(Risk.department_id.in_(dept_ids))
    new_risks = await db.scalar(select(func.count(Risk.id)).where(*risk_conditions))

    # Risks archived in period (end-exclusive: [start, end))
    # Note: 'closed' status was merged into 'archived' in Phase 2.2
    archived_conditions = [
        Risk.updated_at >= start,
        Risk.updated_at < end,
        Risk.status == RiskStatus.archived.value,
    ]
    if dept_ids is not None:
        archived_conditions.append(Risk.department_id.in_(dept_ids))
    archived_risks = await db.scalar(select(func.count(Risk.id)).where(*archived_conditions))

    # Audit activity: control executions in period (end-exclusive: [start, end))
    audit_activity_query = select(func.count(ControlExecution.id)).where(
        ControlExecution.executed_at >= start,
        ControlExecution.executed_at < end,
    )
    if dept_ids is not None:
        audit_activity_query = audit_activity_query.join(Control, ControlExecution.control_id == Control.id).where(
            Control.department_id.in_(dept_ids)
        )
    audit_activity = await db.scalar(audit_activity_query)

    # Failed audits: executions with result='failed' in period (end-exclusive: [start, end))
    failed_audits_query = select(func.count(ControlExecution.id)).where(
        ControlExecution.executed_at >= start,
        ControlExecution.executed_at < end,
        ControlExecution.result == ExecutionResult.failed.value,
    )
    if dept_ids is not None:
        failed_audits_query = failed_audits_query.join(Control, ControlExecution.control_id == Control.id).where(
            Control.department_id.in_(dept_ids)
        )
    failed_audits = await db.scalar(failed_audits_query)

    # Unaudited controls: active controls with 0 executions in period (end-exclusive: [start, end))
    controls_with_executions = select(ControlExecution.control_id.distinct()).where(
        ControlExecution.executed_at >= start, ControlExecution.executed_at < end
    )
    unaudited_controls_query = select(func.count(Control.id)).where(
        Control.status == ControlStatus.active.value,
        Control.id.notin_(controls_with_executions),
    )
    if dept_ids is not None:
        unaudited_controls_query = unaudited_controls_query.where(Control.department_id.in_(dept_ids))
    unaudited_controls = await db.scalar(unaudited_controls_query)

    # Activity volume: activity log entries in period (end-exclusive: [start, end))
    activity_volume_query = select(func.count(ActivityLog.id)).where(
        ActivityLog.created_at >= start,
        ActivityLog.created_at < end,
    )
    if dept_ids is not None:
        activity_volume_query = activity_volume_query.where(ActivityLog.department_id.in_(dept_ids))
    activity_volume = await db.scalar(activity_volume_query)

    return {
        "new_risks": new_risks or 0,
        "archived_risks": archived_risks or 0,
        "audit_activity": audit_activity or 0,
        "failed_audits": failed_audits or 0,
        "unaudited_controls": unaudited_controls or 0,
        "activity_volume": activity_volume or 0,
    }


def calculate_changes(
    this_quarter: dict,
    last_quarter: dict,
    unavailable_snapshot_metrics: set[str],
) -> dict:
    """
    Calculate percentage and absolute changes between quarters.

    Args:
        this_quarter: Metrics for current quarter
        last_quarter: Metrics for comparison quarter
        unavailable_snapshot_metrics: Snapshot metrics that cannot be compared truthfully

    Returns:
        Dict of changes per metric with absolute, percentage, and direction
    """
    changes = {}
    metric_keys = set(this_quarter) | set(last_quarter) | unavailable_snapshot_metrics
    for key in metric_keys:
        # For snapshot metrics without a valid source on either side, don't show misleading changes.
        if key in unavailable_snapshot_metrics:
            changes[key] = {
                "absolute": 0,
                "percentage": 0,
                "direction": "unknown",
                "note": "Snapshot unavailable for selected period",
            }
        else:
            old_val = last_quarter.get(key, 0)
            new_val = this_quarter.get(key, 0)
            if old_val == 0:
                pct_change = 100 if new_val > 0 else 0
            else:
                pct_change = round(((new_val - old_val) / old_val) * 100, 1)
            changes[key] = {
                "absolute": new_val - old_val,
                "percentage": pct_change,
                "direction": "up" if new_val > old_val else ("down" if new_val < old_val else "same"),
            }

    return changes


def _resolve_snapshot_department_id(dept_ids: list[int] | None) -> int | None | Literal["unavailable"]:
    if dept_ids is None:
        return None
    if len(dept_ids) == 1:
        return dept_ids[0]
    return "unavailable"


async def _resolve_snapshot_metrics(
    db: AsyncSession,
    *,
    quarter_label: str,
    is_live_current_quarter: bool,
    dept_ids: list[int] | None,
    snapshot_department_id: int | None | Literal["unavailable"],
) -> tuple[dict, Literal["live", "stored", "missing"]]:
    if snapshot_department_id == "unavailable":
        return {}, "missing"

    if is_live_current_quarter:
        return await capture_snapshot_metrics(db, dept_ids), "live"

    snapshot_record = await get_quarter_snapshot(db, quarter_label, department_id=snapshot_department_id)
    if not snapshot_record:
        return {}, "missing"
    return dict(snapshot_record.metrics or {}), "stored"


async def build_quarterly_comparison(
    db: AsyncSession,
    current_user: User,
    current_quarter: Optional[str] = None,
    compare_quarter: Optional[str] = None,
) -> dict:
    """
    Build quarter-over-quarter comparison metrics for Risk Committee view.

    Args:
        db: Database session
        current_user: Current authenticated user
        current_quarter: Optional quarter string (e.g., '2026-Q1')
        compare_quarter: Optional comparison quarter string

    Returns:
        Dict with this_quarter, last_quarter, changes, period, and snapshot_info
    """
    now = utc_now()

    dept_ids = get_user_department_ids(current_user)

    # Calculate quarter boundaries
    (
        current_quarter_start,
        current_quarter_end,
        last_quarter_start,
        last_quarter_end,
    ) = calculate_quarter_boundaries(now, current_quarter, compare_quarter)
    validate_quarter_selection(now, current_quarter_start, last_quarter_start)
    effective_current_quarter_end = min(current_quarter_end, now)

    # Get period-based metrics for both quarters
    this_quarter_period = await get_quarter_period_metrics(
        db, current_quarter_start, effective_current_quarter_end, dept_ids
    )
    last_quarter_period = await get_quarter_period_metrics(db, last_quarter_start, last_quarter_end, dept_ids)

    # Get snapshot metrics
    last_quarter_label = get_quarter_label(last_quarter_start)
    selected_current_quarter_label = get_quarter_label(current_quarter_start)
    actual_current_quarter_label = get_quarter_label(now)

    snapshot_department_id = _resolve_snapshot_department_id(dept_ids)
    is_live_current_quarter = selected_current_quarter_label == actual_current_quarter_label

    current_snapshot, current_snapshot_source = await _resolve_snapshot_metrics(
        db,
        quarter_label=selected_current_quarter_label,
        is_live_current_quarter=is_live_current_quarter,
        dept_ids=dept_ids,
        snapshot_department_id=snapshot_department_id,
    )
    last_quarter_snapshot, last_quarter_snapshot_source = await _resolve_snapshot_metrics(
        db,
        quarter_label=last_quarter_label,
        is_live_current_quarter=False,
        dept_ids=dept_ids,
        snapshot_department_id=snapshot_department_id,
    )

    # Combine period and snapshot metrics
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

    # Calculate changes
    changes = calculate_changes(this_quarter_combined, last_quarter_combined, unavailable_snapshot_metrics)

    return {
        "this_quarter": this_quarter_combined,
        "last_quarter": last_quarter_combined,
        "changes": changes,
        "period": {
            "this_start": current_quarter_start.isoformat(),
            "this_end": effective_current_quarter_end.isoformat(),
            "last_start": last_quarter_start.isoformat(),
            "last_end": last_quarter_end.isoformat(),
        },
        "snapshot_info": {
            "current_quarter": selected_current_quarter_label,
            "last_quarter": last_quarter_label,
            "last_quarter_snapshot_available": last_quarter_snapshot_source != "missing",
            "current_quarter_snapshot_available": current_snapshot_source != "missing",
            "missing_snapshot_quarters": missing_snapshot_quarters,
            "snapshot_sources": {
                "current": current_snapshot_source,
                "compare": last_quarter_snapshot_source,
            },
            "missing_snapshot_metrics": {
                "current": sorted(missing_current_snapshot_metrics),
                "compare": sorted(missing_compare_snapshot_metrics),
            },
            "period_metrics": PERIOD_METRICS,
            "snapshot_metrics": SNAPSHOT_METRICS,
        },
    }
