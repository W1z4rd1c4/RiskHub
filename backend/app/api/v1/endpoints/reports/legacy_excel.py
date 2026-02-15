from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, Risk, User

from ._scoping import _validate_department_access
from .unified_exports import _export_controls, _export_risks

router = APIRouter()


def _controls_report_query(
    dept_ids: Optional[list[int]],
    department_id: Optional[int],
    status_filter: Optional[str],
) -> Select:
    query = select(Control).options(selectinload(Control.department))

    if dept_ids is not None:
        query = query.where(Control.department_id.in_(dept_ids))

    if department_id:
        query = query.where(Control.department_id == department_id)
    if status_filter:
        query = query.where(Control.status == status_filter)

    return query.order_by(Control.name)


def _risks_report_query(
    dept_ids: Optional[list[int]],
    department_id: Optional[int],
    status_filter: Optional[str],
) -> Select:
    query = select(Risk).options(selectinload(Risk.department))

    if dept_ids is not None:
        query = query.where(Risk.department_id.in_(dept_ids))

    if department_id:
        query = query.where(Risk.department_id == department_id)
    if status_filter:
        query = query.where(Risk.status == status_filter)

    return query.order_by(Risk.process)


@router.get("/controls/excel")
async def download_controls_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    as_of = datetime.now(UTC).date()
    return await _export_controls(
        db=db,
        current_user=current_user,
        export_format="xlsx",
        as_of_date=as_of,
        department_id=department_id,
        status_filter=status_filter,
        search=None,
    )


@router.get("/risks/excel")
async def download_risks_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    as_of = datetime.now(UTC).date()
    return await _export_risks(
        db=db,
        current_user=current_user,
        export_format="xlsx",
        as_of_date=as_of,
        department_id=department_id,
        status_filter=status_filter,
        search=None,
        risk_type=None,
        is_priority=None,
    )
