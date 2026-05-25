from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import UtcAwareDatetime
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.execution import ExecutionResultEnum
from app.services._reporting.excel import build_audit_trail_export

from ._export_context import build_report_export_context
from ._streaming import (
    EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE,
    ExportFormatQuery,
    resolve_export_format,
)

router = APIRouter()


@router.get("/audit-trail/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_audit_trail_export(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    result: Optional[ExecutionResultEnum] = Query(None, description="Filter by result"),
    control_id: Optional[int] = Query(None, description="Filter by control"),
    from_date: UtcAwareDatetime | None = Query(None, description="Filter from date"),
    to_date: UtcAwareDatetime | None = Query(None, description="Filter to date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/reports/audit-trail/export?format=csv")
    context = build_report_export_context(current_user=current_user, department_id=department_id)
    return await build_audit_trail_export(
        db=db,
        current_user=current_user,
        context=context,
        export_format=export_format,
        result_filter=result,
        control_id=control_id,
        from_date=from_date,
        to_date=to_date,
    )
