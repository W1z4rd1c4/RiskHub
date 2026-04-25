"""
Quarterly Metric Snapshot Service.

Provides functions to capture and retrieve quarterly metric snapshots
for truthful quarter-over-quarter comparisons.
"""

from datetime import datetime, timezone
from typing import Any, Optional
from typing import cast as typing_cast

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approval_request import ApprovalRequest, ApprovalResourceType, ApprovalStatus
from app.models.control import Control
from app.models.department import Department
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.orphaned_item import OrphanedItem
from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot, SnapshotType
from app.models.risk import ControlRiskLink, Risk, RiskStatus
from app.models.vendor import Vendor


def get_quarter_label(dt: datetime) -> str:
    """Get quarter label like '2026-Q1' from a datetime."""
    quarter_num = (dt.month - 1) // 3 + 1
    return f"{dt.year}-Q{quarter_num}"


def get_quarter_number(dt: datetime) -> int:
    """Get quarter number (1-4) from a datetime."""
    return (dt.month - 1) // 3 + 1


def get_quarter_start(year: int, quarter_num: int) -> datetime:
    """Get the start datetime of a quarter."""
    month = (quarter_num - 1) * 3 + 1
    return datetime(year, month, 1, tzinfo=timezone.utc)


def get_quarter_end(year: int, quarter_num: int) -> datetime:
    """Get the end datetime of a quarter (exclusive - start of next quarter)."""
    if quarter_num == 4:
        return datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        return datetime(year, quarter_num * 3 + 1, 1, tzinfo=timezone.utc)


async def capture_snapshot_metrics(
    db: AsyncSession,
    department_ids: Optional[list[int]] = None,
) -> dict:
    """
    Capture current state metrics that represent point-in-time snapshots.

    These are the metrics that cannot be derived from period-based events
    and need to be captured at quarter boundaries for accurate comparisons.

    Args:
        db: Database session
        department_ids: Optional list of department IDs to scope metrics (None = global)

    Returns:
        Dictionary of snapshot metric values
    """
    # Priority risks (current state)
    priority_conditions = [
        Risk.is_priority.is_(True),
        Risk.status != RiskStatus.archived.value,
    ]
    if department_ids is not None:
        priority_conditions.append(Risk.department_id.in_(department_ids))
    priority_count = await db.scalar(select(func.count(Risk.id)).where(*priority_conditions))

    # KRI breaches (current state)
    kri_breach_query = select(func.count(KeyRiskIndicator.id)).where(
        or_(
            KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
            KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
        )
    )
    if department_ids is not None:
        kri_breach_query = kri_breach_query.join(Risk, KeyRiskIndicator.risk_id == Risk.id).where(
            Risk.department_id.in_(department_ids)
        )
    kri_breaches = await db.scalar(kri_breach_query)

    # Pending approvals (current state)
    pending_status_values = [ApprovalStatus.PENDING.value, ApprovalStatus.PENDING_PRIVILEGED.value]
    pending_approval_conditions = [cast(ApprovalRequest.status, String).in_(pending_status_values)]
    if department_ids is None:
        pending_approvals = await db.scalar(select(func.count(ApprovalRequest.id)).where(*pending_approval_conditions))
    else:
        pending_risks = await db.scalar(
            select(func.count(ApprovalRequest.id))
            .join(
                Risk,
                (ApprovalRequest.resource_type == ApprovalResourceType.RISK) & (ApprovalRequest.resource_id == Risk.id),
            )
            .where(*pending_approval_conditions, Risk.department_id.in_(department_ids))
        )
        pending_controls = await db.scalar(
            select(func.count(ApprovalRequest.id))
            .join(
                Control,
                (ApprovalRequest.resource_type == ApprovalResourceType.CONTROL)
                & (ApprovalRequest.resource_id == Control.id),
            )
            .where(*pending_approval_conditions, Control.department_id.in_(department_ids))
        )
        pending_kris = await db.scalar(
            select(func.count(ApprovalRequest.id))
            .join(
                KeyRiskIndicator,
                (ApprovalRequest.resource_type == ApprovalResourceType.KRI)
                & (ApprovalRequest.resource_id == KeyRiskIndicator.id),
            )
            .join(Risk, KeyRiskIndicator.risk_id == Risk.id)
            .where(*pending_approval_conditions, Risk.department_id.in_(department_ids))
        )
        pending_approvals = (pending_risks or 0) + (pending_controls or 0) + (pending_kris or 0)

    # Control coverage (current state)
    total_active_risk_conditions = [Risk.status == RiskStatus.active.value]
    if department_ids is not None:
        total_active_risk_conditions.append(Risk.department_id.in_(department_ids))
    total_active_risks = await db.scalar(select(func.count(Risk.id)).where(*total_active_risk_conditions)) or 1

    risks_with_controls_query = (
        select(func.count(Risk.id.distinct()))
        .select_from(Risk)
        .join(ControlRiskLink, ControlRiskLink.risk_id == Risk.id)
        .where(Risk.status == RiskStatus.active.value)
    )
    if department_ids is not None:
        risks_with_controls_query = risks_with_controls_query.where(Risk.department_id.in_(department_ids))
    risks_with_controls = await db.scalar(risks_with_controls_query)
    control_coverage = round((risks_with_controls or 0) / total_active_risks * 100)

    # Orphaned items (current state)
    if department_ids is None:
        orphaned_items = await db.scalar(select(func.count(OrphanedItem.id)).where(OrphanedItem.resolved_at.is_(None)))
    else:
        orphaned_risks = await db.scalar(
            select(func.count(OrphanedItem.id))
            .join(Risk, (OrphanedItem.item_type == "risk") & (OrphanedItem.item_id == Risk.id))
            .where(OrphanedItem.resolved_at.is_(None), Risk.department_id.in_(department_ids))
        )
        orphaned_controls = await db.scalar(
            select(func.count(OrphanedItem.id))
            .join(Control, (OrphanedItem.item_type == "control") & (OrphanedItem.item_id == Control.id))
            .where(OrphanedItem.resolved_at.is_(None), Control.department_id.in_(department_ids))
        )
        orphaned_items = (orphaned_risks or 0) + (orphaned_controls or 0)

    # KRI health (current state)
    total_kris_query = select(func.count(KeyRiskIndicator.id))
    kris_within_query = select(func.count(KeyRiskIndicator.id)).where(
        KeyRiskIndicator.current_value >= KeyRiskIndicator.lower_limit,
        KeyRiskIndicator.current_value <= KeyRiskIndicator.upper_limit,
    )
    if department_ids is not None:
        total_kris_query = total_kris_query.join(Risk, KeyRiskIndicator.risk_id == Risk.id).where(
            Risk.department_id.in_(department_ids)
        )
        kris_within_query = kris_within_query.join(Risk, KeyRiskIndicator.risk_id == Risk.id).where(
            Risk.department_id.in_(department_ids)
        )
    total_kris = await db.scalar(total_kris_query) or 1
    kris_within = await db.scalar(kris_within_query)
    kri_health = round((kris_within or 0) / total_kris * 100)

    # Overdue KRIs (current state)
    overdue_kris_query = select(func.count(KeyRiskIndicator.id)).where(
        KeyRiskIndicator.last_period_end.isnot(None),
        func.date(KeyRiskIndicator.last_period_end) + 15 < func.current_date(),
    )
    if department_ids is not None:
        overdue_kris_query = overdue_kris_query.join(Risk, KeyRiskIndicator.risk_id == Risk.id).where(
            Risk.department_id.in_(department_ids)
        )
    overdue_kris = await db.scalar(overdue_kris_query)

    # Risks without KRI (current state)
    risks_with_kri = select(KeyRiskIndicator.risk_id.distinct())
    risks_without_kri_query = select(func.count(Risk.id)).where(
        Risk.status == RiskStatus.active.value,
        Risk.id.notin_(risks_with_kri),
    )
    if department_ids is not None:
        risks_without_kri_query = risks_without_kri_query.where(Risk.department_id.in_(department_ids))
    risks_without_kri = await db.scalar(risks_without_kri_query)

    # Active risks (current state) - only count active, not emerging
    active_conditions = [
        Risk.status == RiskStatus.active.value,
    ]
    if department_ids is not None:
        active_conditions.append(Risk.department_id.in_(department_ids))
    active_risks = await db.scalar(select(func.count(Risk.id)).where(*active_conditions))

    # Vendor snapshot metrics (Phase 18-11)
    vendor_conditions = [Vendor.status == "active"]
    if department_ids is not None:
        vendor_conditions.append(Vendor.department_id.in_(department_ids))
    active_vendors = await db.scalar(select(func.count(Vendor.id)).where(*vendor_conditions))

    return {
        "priority_risks": priority_count or 0,
        "kri_breaches": kri_breaches or 0,
        "pending_approvals": pending_approvals or 0,
        "control_coverage": control_coverage,
        "orphaned_items": orphaned_items or 0,
        "kri_health": kri_health,
        "overdue_kris": overdue_kris or 0,
        "risks_without_kri": risks_without_kri or 0,
        "active_risks": active_risks or 0,
        "active_vendors": active_vendors or 0,
    }


async def save_quarter_snapshot(
    db: AsyncSession,
    quarter_label: str,
    year: int,
    quarter_number: int,
    metrics: dict,
    department_id: Optional[int] = None,
    snapshot_type: SnapshotType | str = SnapshotType.QUARTER_END,
    captured_by_user_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> QuarterlyMetricSnapshot:
    """
    Save a quarterly metric snapshot to the database.

    Args:
        db: Database session
        quarter_label: Quarter label like '2026-Q1'
        year: Year
        quarter_number: Quarter number (1-4)
        metrics: Dictionary of metric values
        department_id: Optional department ID (None = global)
        snapshot_type: Type of snapshot
        captured_by_user_id: Optional user ID who triggered capture
        notes: Optional notes

    Returns:
        Created or updated snapshot
    """
    if not isinstance(snapshot_type, SnapshotType):
        if isinstance(snapshot_type, str):
            normalized_snapshot_type = snapshot_type.strip().lower()
            snapshot_type = SnapshotType(normalized_snapshot_type)
        else:
            raise ValueError("Invalid snapshot type")

    # Check if snapshot already exists
    existing = await db.execute(
        select(QuarterlyMetricSnapshot).where(
            QuarterlyMetricSnapshot.quarter == quarter_label,
            QuarterlyMetricSnapshot.department_id == department_id
            if department_id
            else QuarterlyMetricSnapshot.department_id.is_(None),
        )
    )
    snapshot = existing.scalar_one_or_none()

    if snapshot:
        writable_snapshot = typing_cast(Any, snapshot)
        # Update existing snapshot
        writable_snapshot.metrics = metrics
        writable_snapshot.captured_at = datetime.now(timezone.utc)
        writable_snapshot.snapshot_type = snapshot_type
        if captured_by_user_id:
            writable_snapshot.captured_by_user_id = captured_by_user_id
        if notes:
            writable_snapshot.notes = notes
    else:
        # Create new snapshot
        snapshot = QuarterlyMetricSnapshot(
            quarter=quarter_label,
            year=year,
            quarter_number=quarter_number,
            snapshot_type=snapshot_type,
            department_id=department_id,
            metrics=metrics,
            captured_by_user_id=captured_by_user_id,
            notes=notes,
        )
        db.add(snapshot)

    await db.flush()
    return snapshot


async def get_quarter_snapshot(
    db: AsyncSession,
    quarter_label: str,
    department_id: Optional[int] = None,
) -> Optional[QuarterlyMetricSnapshot]:
    """
    Retrieve a quarterly metric snapshot.

    Args:
        db: Database session
        quarter_label: Quarter label like '2026-Q1'
        department_id: Optional department ID (None = global)

    Returns:
        Snapshot if found, None otherwise
    """
    result = await db.execute(
        select(QuarterlyMetricSnapshot).where(
            QuarterlyMetricSnapshot.quarter == quarter_label,
            QuarterlyMetricSnapshot.department_id == department_id
            if department_id
            else QuarterlyMetricSnapshot.department_id.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def capture_current_quarter_snapshot(
    db: AsyncSession,
    department_ids: Optional[list[int]] = None,
    captured_by_user_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> QuarterlyMetricSnapshot:
    """
    Capture a snapshot for the current quarter.

    Args:
        db: Database session
        department_ids: Optional department IDs for scoped capture
        captured_by_user_id: Optional user ID who triggered capture
        notes: Optional notes

    Returns:
        Created snapshot
    """
    now = datetime.now(timezone.utc)
    quarter_label = get_quarter_label(now)
    year = now.year
    quarter_number = get_quarter_number(now)

    # Capture metrics
    metrics = await capture_snapshot_metrics(db, department_ids)

    # Determine department_id for storage (None for global)
    dept_id = None if department_ids is None else (department_ids[0] if len(department_ids) == 1 else None)

    # Save snapshot
    return await save_quarter_snapshot(
        db=db,
        quarter_label=quarter_label,
        year=year,
        quarter_number=quarter_number,
        metrics=metrics,
        department_id=dept_id,
        snapshot_type=SnapshotType.QUARTER_END if notes is None else SnapshotType.MANUAL,
        captured_by_user_id=captured_by_user_id,
        notes=notes,
    )


async def capture_current_quarter_snapshots_for_committee(
    db: AsyncSession,
    captured_by_user_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> QuarterlyMetricSnapshot:
    """
    Capture the global current-quarter snapshot plus one snapshot per active department.

    The returned snapshot is the global snapshot to preserve the admin endpoint response contract.
    """
    global_snapshot = await capture_current_quarter_snapshot(
        db=db,
        department_ids=None,
        captured_by_user_id=captured_by_user_id,
        notes=notes,
    )

    department_ids = (
        (
            await db.execute(
                select(Department.id)
                .where(Department.is_active.is_(True))
                .order_by(Department.id)
            )
        )
        .scalars()
        .all()
    )
    for department_id in department_ids:
        await capture_current_quarter_snapshot(
            db=db,
            department_ids=[department_id],
            captured_by_user_id=captured_by_user_id,
            notes=notes,
        )

    return global_snapshot
