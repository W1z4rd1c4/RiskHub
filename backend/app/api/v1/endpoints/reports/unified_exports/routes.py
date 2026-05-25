from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import has_permission
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.models.issue import IssueSeverity, IssueStatus
from app.services._reporting.exports import get_export_builder
from app.services._reporting.exports.shared import (
    ControlMonitoringExportStatus,
    KRIExportStatus,
    KRIMonitoringExportStatus,
    KRITimelinessExportStatus,
)

from .._export_context import build_report_export_context
from .._streaming import EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE, ExportFormatQuery, resolve_export_format

router = APIRouter()


@router.get("/risks/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def export_risks(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    risk_type: Optional[str] = Query(None),
    is_priority: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/reports/risks/export?format=csv")
    context = build_report_export_context(current_user=current_user, department_id=department_id, as_of_date=as_of_date)
    export_builder = get_export_builder("risks")
    return await export_builder(
        db=db,
        current_user=current_user,
        export_format=export_format,
        as_of_date=context.export_date,
        department_id=department_id,
        status_filter=status_filter,
        search=search,
        risk_type=risk_type,
        is_priority=is_priority,
    )


@router.get("/controls/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def export_controls(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    monitoring_status_filter: Optional[ControlMonitoringExportStatus] = Query(None, alias="monitoring_status"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/reports/controls/export?format=csv")
    context = build_report_export_context(current_user=current_user, department_id=department_id, as_of_date=as_of_date)
    export_builder = get_export_builder("controls")
    return await export_builder(
        db=db,
        current_user=current_user,
        export_format=export_format,
        as_of_date=context.export_date,
        department_id=department_id,
        status_filter=status_filter,
        monitoring_status_filter=monitoring_status_filter,
        search=search,
    )


@router.get("/kris/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def export_kris(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: KRIExportStatus = Query("all", alias="status"),
    monitoring_status_filter: Optional[KRIMonitoringExportStatus] = Query(None, alias="monitoring_status"),
    timeliness_status_filter: Optional[KRITimelinessExportStatus] = Query(None, alias="timeliness_status"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    if monitoring_status_filter is not None and timeliness_status_filter is not None:
        raise HTTPException(
            status_code=422,
            detail="monitoring_status and timeliness_status cannot be used together",
        )

    export_format = resolve_export_format(format, replacement="/api/v1/reports/kris/export?format=csv")
    context = build_report_export_context(current_user=current_user, department_id=department_id, as_of_date=as_of_date)
    export_builder = get_export_builder("kris")
    return await export_builder(
        db=db,
        current_user=current_user,
        export_format=export_format,
        as_of_date=context.export_date,
        department_id=department_id,
        status_filter=status_filter,
        monitoring_status_filter=monitoring_status_filter,
        timeliness_status_filter=timeliness_status_filter,
        search=search,
    )


@router.get("/vendors/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def export_vendors(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    vendor_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/reports/vendors/export?format=csv")
    context = build_report_export_context(current_user=current_user, department_id=department_id, as_of_date=as_of_date)
    export_builder = get_export_builder("vendors")
    return await export_builder(
        db=db,
        current_user=current_user,
        export_format=export_format,
        as_of_date=context.export_date,
        department_id=department_id,
        status_filter=status_filter,
        search=search,
        vendor_type=vendor_type,
    )


@router.get("/issues/export", responses=EXCEL_EXPORT_REMOVED_OPENAPI_RESPONSE)
async def export_issues(
    format: ExportFormatQuery = Query(..., description="Export format: csv"),
    as_of_date: Optional[date] = Query(None, description="Point-in-time date (YYYY-MM-DD)"),
    department_id: Optional[int] = Query(None),
    status_filter: Optional[IssueStatus] = Query(None, alias="status"),
    severity: Optional[IssueSeverity] = Query(None),
    severity_group: Optional[Literal["high_critical"]] = Query(None),
    owner_user_id: Optional[int] = Query(None),
    overdue_only: bool = Query(False),
    exclude_active_exceptions: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/reports/issues/export?format=csv")
    if not has_permission(current_user, "issues", "read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: issues:read",
        )

    context = build_report_export_context(current_user=current_user, department_id=department_id, as_of_date=as_of_date)
    export_builder = get_export_builder("issues")
    return await export_builder(
        db=db,
        current_user=current_user,
        export_format=export_format,
        as_of_date=context.export_date,
        department_id=department_id,
        status_filter=status_filter,
        severity_filter=severity,
        severity_group=severity_group,
        owner_user_id=owner_user_id,
        overdue_only=overdue_only,
        exclude_active_exceptions=exclude_active_exceptions,
    )
