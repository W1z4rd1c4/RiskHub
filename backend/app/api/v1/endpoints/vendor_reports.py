"""
Vendor reporting exports.

Exports:
- Annual Vendor Management Report (CSV)
- DORA Register of Information (CSV)
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.reports._streaming import (
    ExportFormatQuery,
    _stream_binary,
    resolve_export_format,
)
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.models.role import RoleType
from app.services.report_service import generate_tabular_csv
from app.services.vendor_reporting_service import VendorReportingService

router = APIRouter()


def _require_vendor_report_role(current_user: User) -> None:
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    allowed = {
        RoleType.RISK_MANAGER.value,
        RoleType.CRO.value,
        RoleType.COMPLIANCE.value,
        RoleType.INTERNAL_AUDIT.value,
    }
    if role_name not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to vendor reports")


def _annual_report_rows(report) -> tuple[list[str], list[list[object]]]:
    headers = [
        "Vendor ID",
        "Name",
        "Legal Name",
        "Vendor Type",
        "Department",
        "Owner",
        "Process",
        "Subprocess",
        "Supports Core Function",
        "DORA Relevant",
        "Significant Vendor",
        "Risk Score (1-5)",
        "Last Decision",
        "Next Reassessment Due",
        "Cadence (months)",
        "Major Breaches (count)",
        "Major Incidents (count)",
        "Major Items (preview)",
        "Report Year",
        "Generated At",
    ]
    rows: list[list[object]] = []
    for vendor in report.vendors:
        rows.append(
            [
                vendor.vendor_id,
                vendor.name,
                vendor.legal_name or "",
                vendor.vendor_type,
                vendor.department_name or "",
                vendor.outsourcing_owner_name or "",
                vendor.process,
                vendor.subprocess or "",
                bool(vendor.supports_important_core_insurance_function),
                bool(vendor.dora_relevant),
                bool(vendor.is_significant_vendor),
                vendor.risk_score_1_5,
                vendor.last_decided_at.isoformat() if vendor.last_decided_at else "",
                vendor.next_reassessment_due_at.isoformat() if vendor.next_reassessment_due_at else "",
                vendor.reassessment_cadence_months,
                vendor.major_breaches_count,
                vendor.major_incidents_count,
                "; ".join(vendor.major_items_preview or []),
                report.process_evaluation.year,
                report.generated_at.isoformat(),
            ]
        )
    return headers, rows


def _dora_register_rows(rows) -> tuple[list[str], list[list[object]]]:
    headers = [
        "vendor_id",
        "name",
        "legal_name",
        "registration_id",
        "vendor_type",
        "dora_relevant",
        "is_significant_vendor",
        "supports_important_core_insurance_function",
        "risk_score_1_5",
        "outsourcing_owner_user_id",
        "outsourcing_owner_name",
        "department_id",
        "department_name",
        "process",
        "subprocess",
        "last_decided_at",
        "next_reassessment_due_at",
        "reassessment_cadence_months",
        "replaceability",
        "has_alternative_providers",
    ]
    data_rows: list[list[object]] = []
    for row in rows:
        data_rows.append(
            [
                row.vendor_id,
                row.name,
                row.legal_name or "",
                row.registration_id or "",
                row.vendor_type,
                bool(row.dora_relevant),
                bool(row.is_significant_vendor),
                bool(row.supports_important_core_insurance_function),
                row.risk_score_1_5,
                row.outsourcing_owner_user_id or "",
                row.outsourcing_owner_name or "",
                row.department_id or "",
                row.department_name or "",
                row.process,
                row.subprocess or "",
                row.last_decided_at.isoformat() if row.last_decided_at else "",
                row.next_reassessment_due_at.isoformat() if row.next_reassessment_due_at else "",
                row.reassessment_cadence_months,
                row.replaceability or "",
                bool(row.has_alternative_providers),
            ]
        )
    return headers, data_rows


@router.get("/vendor-reports/annual")
async def download_vendor_annual_report(
    year: int = Query(..., ge=2000, le=2100),
    format: ExportFormatQuery = Query("csv", description="Export format: csv"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/vendor-reports/annual?format=csv")
    _require_vendor_report_role(current_user)
    report = await VendorReportingService.build_annual_report(db, year=year, current_user=current_user)
    headers, rows = _annual_report_rows(report)
    return _stream_binary(
        filename_base=f"vendor-annual-report-{year}",
        export_format=export_format,
        content_bytes=generate_tabular_csv(headers, rows),
        as_of_date=datetime.now(UTC).date(),
    )


@router.get("/vendor-reports/dora-register")
async def download_vendor_dora_register(
    format: ExportFormatQuery = Query("csv", description="Export format: csv"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read")),
):
    export_format = resolve_export_format(format, replacement="/api/v1/vendor-reports/dora-register?format=csv")
    _require_vendor_report_role(current_user)
    rows = await VendorReportingService.build_dora_register(db, current_user=current_user)
    headers, data_rows = _dora_register_rows(rows)
    return _stream_binary(
        filename_base="vendor-dora-register",
        export_format=export_format,
        content_bytes=generate_tabular_csv(headers, data_rows),
        as_of_date=datetime.now(UTC).date(),
    )
