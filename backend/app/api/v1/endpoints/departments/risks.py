from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.risk import risk_to_summary
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import Risk, User
from app.models.risk import RiskStatus
from app.schemas.risk import RiskSummary

from ._shared import _assert_department_in_scope

router = APIRouter()


@router.get("/{department_id}/risks", response_model=list[RiskSummary])
async def list_department_risks(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status: Optional[str] = None,
    min_net_score: Optional[int] = Query(None, ge=0, le=25, description="Filter risks with net_score >= this value"),
):
    """
    List risks for a specific department with KRI metadata.

    Access: 404 if not found; 403 if out of scope.
    Excludes: Archived risks by default (explicit status param overrides).
    Pagination: skip/limit with MAX_PAGE_SIZE cap.
    """
    if not check_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=403, detail="Permission denied: risks:read")

    await _assert_department_in_scope(department_id, db, current_user)

    # Load risks with their KRIs eagerly
    query = (
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.kris),  # Load KRIs for count and breach check
            selectinload(Risk.control_links),
        )
        .where(Risk.department_id == department_id)
    )

    if status:
        query = query.where(Risk.status == status)
    else:
        query = query.where(Risk.status != RiskStatus.archived.value)

    # Apply min_net_score filter for high-risk filtering
    if min_net_score is not None:
        query = query.where(Risk.net_score >= min_net_score)

    query = query.offset(skip).limit(limit).order_by(Risk.risk_id_code)

    result = await db.execute(query)
    risks = result.scalars().all()

    return [risk_to_summary(r) for r in risks]

