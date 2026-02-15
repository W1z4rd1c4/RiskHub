from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.models.risk import RiskStatus
from app.schemas.kri import KRIResponse

from ._shared import _assert_department_in_scope

router = APIRouter()


@router.get("/{department_id}/kris", response_model=list[KRIResponse])
async def list_department_kris(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    """
    List KRIs for a specific department.

    Access: 404 if not found; 403 if out of scope.
    Excludes: KRIs linked to archived risks.
    Pagination: skip/limit with MAX_PAGE_SIZE cap.
    """
    if not check_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=403, detail="Permission denied: risks:read")

    await _assert_department_in_scope(department_id, db, current_user)

    # Query KRIs via Risk (exclude archived risks)
    query = (
        select(KeyRiskIndicator)
        .join(Risk)
        .where(and_(Risk.department_id == department_id, Risk.status != RiskStatus.archived.value))
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.reporting_owner),
        )
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    kris = result.scalars().unique().all()

    # Map to response with metadata (same logic as in kris.py)
    items = []
    for k in kris:
        res = KRIResponse.model_validate(k)
        # Add owner info
        if k.reporting_owner:
            res.reporting_owner_name = k.reporting_owner.name
        if k.risk:
            res.risk_category = k.risk.category
            res.risk_process = k.risk.process
            if k.risk.owner:
                res.risk_owner_name = k.risk.owner.name
            if k.risk.department:
                res.department_name = k.risk.department.name
        items.append(res)

    return items

