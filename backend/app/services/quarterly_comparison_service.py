"""
Quarterly comparison service for Risk Committee dashboard.

Extracted from dashboard.py to improve readability and testability.
This service computes period-based metrics (events that happened within a quarter)
while snapshot-based metrics are handled by snapshot_service.py.
"""
import re
import logging
from datetime import datetime, timezone
from typing import Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Control, Risk
from app.models.activity_log import ActivityLog
from app.models.control import ControlStatus
from app.models.control_execution import ControlExecution, ExecutionResult
from app.models.risk import RiskStatus
from app.core.permissions import get_user_department_ids
from app.core.snapshot_service import (
    capture_snapshot_metrics,
    get_quarter_label,
    get_quarter_snapshot,
)

logger = logging.getLogger(__name__)


def parse_quarter(quarter_str: str) -> datetime:
    """
    Parse a quarter string like '2026-Q1' into a datetime for the quarter start.
    
    Args:
        quarter_str: Quarter in 'YYYY-QN' format (e.g., '2026-Q1')
        
    Returns:
        Naive datetime for the first day of the quarter
        
    Raises:
        ValueError: If the quarter format is invalid
    """
    match = re.match(r'^(\d{4})-Q([1-4])$', quarter_str)
    if not match:
        raise ValueError(f"Invalid quarter format: {quarter_str}. Expected 'YYYY-QN' (e.g., '2026-Q1')")
    year = int(match.group(1))
    quarter = int(match.group(2))
    month = (quarter - 1) * 3 + 1
    return datetime(year, month, 1)


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
        now: Current naive UTC datetime
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
        actual_current_quarter_start = datetime(now.year, ((now.month - 1) // 3) * 3 + 1, 1)
        if current_quarter_start == actual_current_quarter_start:
            current_quarter_end = now  # Use current time for in-progress quarter
    else:
        current_quarter_start = datetime(now.year, ((now.month - 1) // 3) * 3 + 1, 1)
        current_quarter_end = now  # Use current time for in-progress quarter
    
    if compare_quarter:
        last_quarter_start = parse_quarter(compare_quarter)
        last_quarter_end = last_quarter_start + relativedelta(months=3)
    else:
        last_quarter_start = current_quarter_start - relativedelta(months=3)
        # last_quarter_end is current_quarter_start (exclusive upper bound)
        last_quarter_end = current_quarter_start
    
    return current_quarter_start, current_quarter_end, last_quarter_start, last_quarter_end


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
    new_risks = await db.scalar(
        select(func.count(Risk.id)).where(*risk_conditions)
    )
    
    # Risks archived in period (end-exclusive: [start, end))
    # Note: 'closed' status was merged into 'archived' in Phase 2.2
    archived_conditions = [
        Risk.updated_at >= start,
        Risk.updated_at < end,
        Risk.status == RiskStatus.archived.value,
    ]
    if dept_ids is not None:
        archived_conditions.append(Risk.department_id.in_(dept_ids))
    archived_risks = await db.scalar(
        select(func.count(Risk.id)).where(*archived_conditions)
    )
    
    # Audit activity: control executions in period (end-exclusive: [start, end))
    audit_activity_query = select(func.count(ControlExecution.id)).where(
        ControlExecution.executed_at >= start,
        ControlExecution.executed_at < end,
    )
    if dept_ids is not None:
        audit_activity_query = audit_activity_query.join(
            Control, ControlExecution.control_id == Control.id
        ).where(Control.department_id.in_(dept_ids))
    audit_activity = await db.scalar(audit_activity_query)
    
    # Failed audits: executions with result='failed' in period (end-exclusive: [start, end))
    failed_audits_query = select(func.count(ControlExecution.id)).where(
        ControlExecution.executed_at >= start,
        ControlExecution.executed_at < end,
        ControlExecution.result == ExecutionResult.failed.value,
    )
    if dept_ids is not None:
        failed_audits_query = failed_audits_query.join(
            Control, ControlExecution.control_id == Control.id
        ).where(Control.department_id.in_(dept_ids))
    failed_audits = await db.scalar(failed_audits_query)
    
    # Unaudited controls: active controls with 0 executions in period (end-exclusive: [start, end))
    controls_with_executions = select(ControlExecution.control_id.distinct()).where(
        ControlExecution.executed_at >= start,
        ControlExecution.executed_at < end
    )
    unaudited_controls_query = select(func.count(Control.id)).where(
        Control.status == ControlStatus.active.value,
        Control.id.notin_(controls_with_executions),
    )
    if dept_ids is not None:
        unaudited_controls_query = unaudited_controls_query.where(
            Control.department_id.in_(dept_ids)
        )
    unaudited_controls = await db.scalar(unaudited_controls_query)
    
    # Activity volume: activity log entries in period (end-exclusive: [start, end))
    activity_volume_query = select(func.count(ActivityLog.id)).where(
        ActivityLog.created_at >= start,
        ActivityLog.created_at < end,
    )
    if dept_ids is not None:
        activity_volume_query = activity_volume_query.where(
            ActivityLog.department_id.in_(dept_ids)
        )
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
    snapshot_available: bool,
) -> dict:
    """
    Calculate percentage and absolute changes between quarters.
    
    Args:
        this_quarter: Metrics for current quarter
        last_quarter: Metrics for comparison quarter
        snapshot_available: Whether historical snapshot exists
        
    Returns:
        Dict of changes per metric with absolute, percentage, and direction
    """
    # Metrics that require historical snapshots for valid comparison
    snapshot_metrics = {
        "priority_risks", "kri_breaches", "pending_approvals",
        "control_coverage", "orphaned_items", "kri_health",
        "overdue_kris", "risks_without_kri", "active_risks",
        "active_vendors", "overdue_vendor_reassessments", "vendor_sla_breaches",
    }
    
    changes = {}
    for key in this_quarter:
        old_val = last_quarter.get(key, 0)
        new_val = this_quarter[key]
        
        # For snapshot metrics without historical data, don't show misleading changes
        if key in snapshot_metrics and not snapshot_available:
            changes[key] = {
                "absolute": 0,
                "percentage": 0,
                "direction": "unknown",
                "note": "No historical snapshot available",
            }
        else:
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
    # Use UTC time but store as naive datetime (PostgreSQL columns are TIMESTAMP WITHOUT TIME ZONE)
    now_utc = datetime.now(timezone.utc)
    now = now_utc.replace(tzinfo=None)  # Naive UTC for DB queries
    
    dept_ids = get_user_department_ids(current_user)
    
    # Calculate quarter boundaries
    (
        current_quarter_start,
        current_quarter_end,
        last_quarter_start,
        last_quarter_end,
    ) = calculate_quarter_boundaries(now, current_quarter, compare_quarter)
    
    # Get period-based metrics for both quarters
    this_quarter_period = await get_quarter_period_metrics(
        db, current_quarter_start, now, dept_ids
    )
    last_quarter_period = await get_quarter_period_metrics(
        db, last_quarter_start, last_quarter_end, dept_ids
    )
    
    # Get snapshot metrics
    last_quarter_label = get_quarter_label(last_quarter_start)
    current_quarter_label = get_quarter_label(now)
    
    # Current quarter snapshot = live data
    current_snapshot = await capture_snapshot_metrics(db, dept_ids)
    
    # Last quarter snapshot = from stored snapshot (if available)
    last_quarter_snapshot_record = await get_quarter_snapshot(db, last_quarter_label)
    snapshot_available = last_quarter_snapshot_record is not None
    last_quarter_snapshot = (
        last_quarter_snapshot_record.metrics
        if last_quarter_snapshot_record
        else current_snapshot  # Fallback: same values = no change shown
    )
    
    # Combine period and snapshot metrics
    this_quarter_combined = {**this_quarter_period, **current_snapshot}
    last_quarter_combined = {**last_quarter_period, **last_quarter_snapshot}
    
    # Calculate changes
    changes = calculate_changes(
        this_quarter_combined, last_quarter_combined, snapshot_available
    )
    
    # Snapshot metric names for response
    snapshot_metric_names = {
        "priority_risks", "kri_breaches", "pending_approvals",
        "control_coverage", "orphaned_items", "kri_health",
        "overdue_kris", "risks_without_kri", "active_risks"
    }
    
    return {
        "this_quarter": this_quarter_combined,
        "last_quarter": last_quarter_combined,
        "changes": changes,
        "period": {
            "this_start": current_quarter_start.isoformat(),
            "this_end": now.isoformat(),
            "last_start": last_quarter_start.isoformat(),
            "last_end": last_quarter_end.isoformat(),
        },
        "snapshot_info": {
            "current_quarter": current_quarter_label,
            "last_quarter": last_quarter_label,
            "last_quarter_snapshot_available": snapshot_available,
            "period_metrics": [
                "new_risks", "archived_risks", "audit_activity",
                "failed_audits", "unaudited_controls", "activity_volume"
            ],
            "snapshot_metrics": list(snapshot_metric_names),
        },
    }
