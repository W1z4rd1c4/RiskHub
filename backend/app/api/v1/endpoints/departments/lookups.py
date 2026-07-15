from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.pagination import MAX_LOOKUP_SIZE
from app.db.session import get_db
from app.models import Department, User
from app.schemas.process import ProcessDepartmentLookup
from app.services._ict_register_lifecycle.policy import (
    assert_process_assignment_lookup_allowed,
)

router = APIRouter()


@router.get("/lookup/process-owners", response_model=list[ProcessDepartmentLookup])
async def lookup_process_owning_departments(
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProcessDepartmentLookup]:
    """Return active canonical Departments for Process ownership assignment."""
    await assert_process_assignment_lookup_allowed(db, current_user=current_user)
    query = select(Department).where(Department.is_active.is_(True))
    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(Department.name.ilike(search_term), Department.code.ilike(search_term))
        )
    departments = (
        await db.execute(
            query.order_by(Department.name.asc(), Department.id.asc()).limit(
                min(limit, MAX_LOOKUP_SIZE)
            )
        )
    ).scalars().all()
    return [ProcessDepartmentLookup.model_validate(department) for department in departments]
