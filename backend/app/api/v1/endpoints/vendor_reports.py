"""
Vendor reporting exports (Phase 18-09).

Exports:
- Annual Vendor Management Report (PDF/Excel)
- DORA Register of Information (Excel)
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.models.role import RoleType
from app.services.vendor_reporting_service import VendorReportingService
from app.services.report_service import generate_vendor_annual_report_pdf, generate_vendor_annual_report_excel, generate_vendor_dora_register_excel

router = APIRouter()

_PDF_MEDIA_TYPE = "application/pdf"
_EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _get_filename(base: str, ext: str) -> str:
    date_str = datetime.now().strftime("%Y-%m-%d")
    return f"{base}-{date_str}.{ext}"


def _stream_pdf(filename_base: str, content_bytes: bytes) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(content_bytes),
        media_type=_PDF_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{_get_filename(filename_base, "pdf")}"'},
    )


def _stream_excel(filename_base: str, content_bytes: bytes) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(content_bytes),
        media_type=_EXCEL_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{_get_filename(filename_base, "xlsx")}"'},
    )


def _require_vendor_report_role(current_user: User) -> None:
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    allowed = {RoleType.RISK_MANAGER.value, RoleType.CRO.value, RoleType.COMPLIANCE.value, RoleType.INTERNAL_AUDIT.value}
    if role_name not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to vendor reports")


@router.get("/vendor-reports/annual")
async def download_vendor_annual_report(
    year: int = Query(..., ge=2000, le=2100),
    format: Literal["pdf", "xlsx"] = Query("pdf"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    _require_vendor_report_role(current_user)
    report = await VendorReportingService.build_annual_report(db, year=year, current_user=current_user)
    if format == "pdf":
        return _stream_pdf(f"vendor-annual-report-{year}", generate_vendor_annual_report_pdf(report))
    return _stream_excel(f"vendor-annual-report-{year}", generate_vendor_annual_report_excel(report))


@router.get("/vendor-reports/dora-register")
async def download_vendor_dora_register(
    format: Literal["xlsx"] = Query("xlsx"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    _require_vendor_report_role(current_user)
    rows = await VendorReportingService.build_dora_register(db, current_user=current_user)
    return _stream_excel("vendor-dora-register", generate_vendor_dora_register_excel(rows))

