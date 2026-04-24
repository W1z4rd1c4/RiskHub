from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.security import require_permission
from app.models import User

from ._export_context import build_report_export_context
from ._streaming import EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE, excel_export_removed

router = APIRouter()


@router.get("/controls/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_controls_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    current_user: User = Depends(require_permission("reports", "read")),
):
    build_report_export_context(current_user=current_user, department_id=department_id)
    raise excel_export_removed(replacement="/api/v1/reports/controls/export?format=csv")


@router.get("/risks/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_risks_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    current_user: User = Depends(require_permission("reports", "read")),
):
    build_report_export_context(current_user=current_user, department_id=department_id)
    raise excel_export_removed(replacement="/api/v1/reports/risks/export?format=csv")
