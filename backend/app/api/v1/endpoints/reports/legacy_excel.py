from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.models import User

from ._scoping import _validate_department_access
from ._streaming import EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE, excel_export_removed

router = APIRouter()


@router.get("/controls/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_controls_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    raise excel_export_removed(replacement="/api/v1/reports/controls/export?format=csv")


@router.get("/risks/excel", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def download_risks_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    current_user: User = Depends(require_permission("reports", "read")),
):
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    raise excel_export_removed(replacement="/api/v1/reports/risks/export?format=csv")
