from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Control, ControlExecution, User
from app.models.risk import ControlRiskLink
from app.services.report_service import generate_audit_trail_excel

from ._scoping import _user_has_no_departments, _validate_department_access
from ._streaming import _stream_binary

router = APIRouter()


def _audit_trail_query(
    dept_ids: Optional[list[int]],
    department_id: Optional[int],
    result_filter: Optional[str],
    control_id: Optional[int],
    from_date: Optional[datetime],
    to_date: Optional[datetime],
) -> Select:
    query = (
        select(ControlExecution)
        .join(Control, ControlExecution.control_id == Control.id)
        .options(
            selectinload(ControlExecution.control).selectinload(Control.department),
            selectinload(ControlExecution.control).selectinload(Control.risk_links).selectinload(ControlRiskLink.risk),
            selectinload(ControlExecution.executed_by),
        )
    )

    if dept_ids is not None:
        query = query.where(Control.department_id.in_(dept_ids))

    if department_id:
        query = query.where(Control.department_id == department_id)
    if result_filter:
        query = query.where(ControlExecution.result == result_filter)
    if control_id:
        query = query.where(ControlExecution.control_id == control_id)
    if from_date:
        query = query.where(ControlExecution.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecution.executed_at <= to_date)

    return query.order_by(ControlExecution.executed_at.desc())


@router.get("/audit-trail/excel")
async def download_audit_trail_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    result: Optional[str] = Query(None, description="Filter by result (passed/failed/warning)"),
    control_id: Optional[int] = Query(None, description="Filter by control"),
    from_date: Optional[datetime] = Query(None, description="Filter from date"),
    to_date: Optional[datetime] = Query(None, description="Filter to date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)

    if _user_has_no_departments(dept_ids):
        return _stream_binary(
            filename_base="audit-trail",
            export_format="xlsx",
            content_bytes=generate_audit_trail_excel([]),
            as_of_date=datetime.now(UTC).date(),
        )

    query = _audit_trail_query(dept_ids, department_id, result, control_id, from_date, to_date)
    result_set = await db.execute(query)
    executions = result_set.scalars().all()

    return _stream_binary(
        filename_base="audit-trail",
        export_format="xlsx",
        content_bytes=generate_audit_trail_excel(list(executions)),
        as_of_date=datetime.now(UTC).date(),
    )
