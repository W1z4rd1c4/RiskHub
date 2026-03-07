from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import (
    build_control_monitoring_fields,
    load_monitoring_response_context,
)
from app.core.datetime_utils import utc_now
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import Control, User
from app.models.control import ControlStatus
from app.schemas.control import ControlFormEnum, ControlStatusEnum, ControlSummary, normalize_control_frequency

from ._shared import _assert_department_in_scope

router = APIRouter()


@router.get("/{department_id}/controls", response_model=list[ControlSummary])
async def list_department_controls(
    department_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("departments", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    status: Optional[str] = None,
):
    """
    List controls for a specific department.

    Access: 404 if not found; 403 if out of scope.
    Excludes: Archived controls by default (explicit status param overrides).
    Pagination: skip/limit with MAX_PAGE_SIZE cap.
    """
    if not check_permission(current_user, "controls", "read"):
        raise HTTPException(status_code=403, detail="Permission denied: controls:read")

    await _assert_department_in_scope(department_id, db, current_user)

    query = select(Control).where(Control.department_id == department_id)

    if status:
        query = query.where(Control.status == status)
    else:
        # Default: exclude archived
        query = query.where(Control.status != ControlStatus.archived.value)

    # Eager load relationships for ControlSummary fields
    query = (
        query.options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.executions),
        )
        .offset(skip)
        .limit(limit)
        .order_by(Control.name)
    )

    result = await db.execute(query)
    controls = result.scalars().all()
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())

    # Map to ControlSummary with populated fields
    return [
        ControlSummary(
            id=c.id,
            name=c.name,
            description=c.description,
            department_id=c.department_id,
            department_name=c.department.name if c.department else None,
            frequency=normalize_control_frequency(c.frequency),
            risk_level=c.risk_level,
            status=ControlStatusEnum(c.status),
            control_form=ControlFormEnum(c.control_form),
            control_owner_name=c.control_owner.name if c.control_owner else None,
            **build_control_monitoring_fields(c, monitoring_context),
        )
        for c in controls
    ]
