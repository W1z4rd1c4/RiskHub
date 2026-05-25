from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.services._reporting.excel import build_summary_export

from ._export_context import build_report_export_context
from ._streaming import (
    EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE,
    ExportFormatQuery,
    resolve_export_format,
)

router = APIRouter()


@router.get("/summary/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_summary_export(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    department_id: Optional[int] = Query(None, description="Filter by department"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/reports/summary/export?format=csv")
    context = build_report_export_context(current_user=current_user, department_id=department_id)
    return await build_summary_export(db=db, context=context, export_format=export_format)
