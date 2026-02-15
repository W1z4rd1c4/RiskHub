from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import User
from app.schemas.admin import SnapshotListItem, SnapshotResponse

from ._deps import require_platform_admin

router = APIRouter()


@router.post("/snapshots/capture", response_model=SnapshotResponse)
async def capture_quarterly_snapshot(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
    notes: str | None = None,
) -> SnapshotResponse:
    """
    Manually capture a quarterly metric snapshot for the current quarter.
    Admin only.

    This endpoint should be called at the end of each quarter to capture
    point-in-time state metrics for accurate historical comparisons.
    """
    from app.core.snapshot_service import capture_current_quarter_snapshot

    # Capture snapshot
    snapshot = await capture_current_quarter_snapshot(
        db=db,
        department_ids=None,  # Global snapshot
        captured_by_user_id=admin_user.id,
        notes=notes or f"Manual capture by {admin_user.name}",
    )

    await db.commit()

    return SnapshotResponse(
        quarter=snapshot.quarter,
        year=snapshot.year,
        quarter_number=snapshot.quarter_number,
        captured_at=snapshot.captured_at.isoformat(),
        metrics=snapshot.metrics,
        message=f"Successfully captured snapshot for {snapshot.quarter}",
    )


@router.get("/snapshots", response_model=list[SnapshotListItem])
async def list_quarterly_snapshots(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> list[SnapshotListItem]:
    """
    List all stored quarterly metric snapshots.
    Admin only.
    """
    from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot

    result = await db.execute(
        select(QuarterlyMetricSnapshot).order_by(
            QuarterlyMetricSnapshot.year.desc(),
            QuarterlyMetricSnapshot.quarter_number.desc(),
        )
    )
    snapshots = result.scalars().all()

    return [
        SnapshotListItem(
            id=s.id,
            quarter=s.quarter,
            year=s.year,
            quarter_number=s.quarter_number,
            captured_at=s.captured_at.isoformat(),
            snapshot_type=s.snapshot_type.value,
            has_metrics=bool(s.metrics),
        )
        for s in snapshots
    ]


@router.get("/snapshots/{quarter}", response_model=SnapshotResponse)
async def get_quarterly_snapshot(
    quarter: str,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> SnapshotResponse:
    """
    Get a specific quarterly metric snapshot.
    Admin only.

    Args:
        quarter: Quarter label like '2026-Q1'
    """
    from app.core.snapshot_service import get_quarter_snapshot as get_snapshot

    snapshot = await get_snapshot(db, quarter)

    if not snapshot:
        raise HTTPException(status_code=404, detail=f"No snapshot found for {quarter}")

    return SnapshotResponse(
        quarter=snapshot.quarter,
        year=snapshot.year,
        quarter_number=snapshot.quarter_number,
        captured_at=snapshot.captured_at.isoformat(),
        metrics=snapshot.metrics,
        message=f"Snapshot for {snapshot.quarter}",
    )

