from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.models import User, Vendor
from app.models._archivable import archived_clause
from app.schemas.vendor_reports import (
    VendorAnnualReportData,
    VendorAnnualReportProcessEvaluation,
    VendorAnnualReportVendorRow,
    VendorDoraRegisterRow,
)
from app.services._vendor_workflow import apply_vendor_report_scope


class VendorReportingService:
    @staticmethod
    async def build_annual_report(
        db: AsyncSession,
        *,
        year: int,
        current_user: User,
        department_id: int | None = None,
    ) -> VendorAnnualReportData:
        now = utc_now()

        vendor_stmt = (
            select(Vendor)
            .where(archived_clause(Vendor, archived=False))
            .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
            .order_by(Vendor.name)
        )
        vendor_stmt = apply_vendor_report_scope(vendor_stmt, current_user, department_id=department_id)

        vendors = (await db.execute(vendor_stmt)).scalars().all()

        vendor_rows: list[VendorAnnualReportVendorRow] = []
        for v in vendors:
            vendor_rows.append(
                VendorAnnualReportVendorRow(
                    vendor_id=v.id,
                    name=v.name,
                    legal_name=v.legal_name,
                    vendor_type=v.vendor_type,
                    department_id=v.department_id,
                    department_name=v.department.name if v.department else None,
                    outsourcing_owner_user_id=v.outsourcing_owner_user_id,
                    outsourcing_owner_name=v.outsourcing_owner.name if v.outsourcing_owner else None,
                    process=v.process,
                    subprocess=v.subprocess,
                    supports_important_core_insurance_function=bool(v.supports_important_core_insurance_function),
                    dora_relevant=bool(v.dora_relevant),
                    is_significant_vendor=bool(v.is_significant_vendor),
                    risk_score_1_5=int(v.risk_score_1_5 or 0),
                )
            )

        process_eval = VendorAnnualReportProcessEvaluation(
            year=year,
            total_active_vendors=len(vendors),
            high_risk_vendors_count=sum(1 for vendor in vendors if int(vendor.risk_score_1_5 or 0) >= 4),
            dora_relevant_count=sum(1 for vendor in vendors if bool(vendor.dora_relevant)),
            significant_vendors_count=sum(1 for vendor in vendors if bool(vendor.is_significant_vendor)),
        )

        return VendorAnnualReportData(
            year=year,
            generated_at=now,
            vendors=vendor_rows,
            process_evaluation=process_eval,
        )

    @staticmethod
    async def build_dora_register(
        db: AsyncSession,
        *,
        current_user: User,
        department_id: int | None = None,
    ) -> list[VendorDoraRegisterRow]:
        vendor_stmt = (
            select(Vendor)
            .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
            .where(archived_clause(Vendor, archived=False))
            .order_by(Vendor.name)
        )
        vendor_stmt = apply_vendor_report_scope(vendor_stmt, current_user, department_id=department_id)

        vendors = (await db.execute(vendor_stmt)).scalars().all()
        return [
            VendorDoraRegisterRow(
                vendor_id=v.id,
                name=v.name,
                legal_name=v.legal_name,
                registration_id=v.registration_id,
                vendor_type=v.vendor_type,
                dora_relevant=bool(v.dora_relevant),
                is_significant_vendor=bool(v.is_significant_vendor),
                supports_important_core_insurance_function=bool(v.supports_important_core_insurance_function),
                risk_score_1_5=int(v.risk_score_1_5 or 0),
                outsourcing_owner_user_id=v.outsourcing_owner_user_id,
                outsourcing_owner_name=v.outsourcing_owner.name if v.outsourcing_owner else None,
                department_id=v.department_id,
                department_name=v.department.name if v.department else None,
                process=v.process,
                subprocess=v.subprocess,
                replaceability=v.replaceability,
                has_alternative_providers=bool(v.has_alternative_providers),
            )
            for v in vendors
        ]
