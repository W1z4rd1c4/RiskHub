from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.v1.endpoints._monitoring_response import (
    load_monitoring_response_context,
    serialize_kri_response,
)
from app.core.datetime_utils import utc_now
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.kri import KRIListResponse
from app.services._monitoring_status import KRIMonitoringStatus, apply_kri_monitoring_status_filter

from ._shared import _assert_department_in_scope

router = APIRouter()


@router.get("/{department_id}/kris", response_model=KRIListResponse)
async def list_department_kris(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    monitoring_status: KRIMonitoringStatus | None = Query(None),
):
    """
    List KRIs for a specific department.

    Access: 404 if not found; 403 if out of scope.
    Excludes: KRIs linked to archived risks and archived KRIs.
    Pagination: skip/limit with MAX_PAGE_SIZE cap.
    """
    if not check_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=403, detail="Permission denied: risks:read")

    await _assert_department_in_scope(department_id, db, current_user)

    # Query KRIs via Risk (exclude archived risks and archived KRIs)
    query = (
        select(KeyRiskIndicator)
        .join(Risk)
        .where(
            and_(
                Risk.department_id == department_id,
                Risk.live(),
                KeyRiskIndicator.is_archived.is_(False),
            )
        )
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.reporting_owner),
        )
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    filtered_query = query
    if monitoring_status is not None:
        filtered_query = apply_kri_monitoring_status_filter(
            filtered_query,
            monitoring_status=monitoring_status,
            today=now.date(),
            warning_upper_margin_ratio=monitoring_context.kri_config.warning_upper_margin_ratio,
        )

    count_query = select(func.count()).select_from(filtered_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = skip if skip is not None else offset
    result = await db.execute(filtered_query.order_by(KeyRiskIndicator.id).offset(offset).limit(limit))
    kris = result.scalars().unique().all()

    # Map to response with metadata (same logic as in kris.py)
    return KRIListResponse(
        items=[serialize_kri_response(kri, monitoring_context) for kri in kris],
        total=total,
        offset=offset,
        limit=limit,
    )
