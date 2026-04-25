"""
Quarterly Metric Snapshot Service.

Provides functions to capture and retrieve quarterly metric snapshots
for truthful quarter-over-quarter comparisons.
"""

from datetime import datetime, timezone
from typing import Any, Optional
from typing import cast as typing_cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core._snapshot_metrics import capture_snapshot_metrics
from app.models.department import Department
from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot, SnapshotType


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
