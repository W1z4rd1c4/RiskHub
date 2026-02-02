from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import get_user_department_ids
from app.models import Department, User, Vendor
from app.models.vendor_contingency_plan import VendorContingencyPlan
from app.models.vendor_exit_plan import VendorExitPlan
from app.models.vendor_incident import VendorIncident
from app.schemas.vendor_reports import (
    VendorAnnualReportData,
    VendorAnnualReportProcessEvaluation,
    VendorAnnualReportVendorRow,
    VendorDoraRegisterRow,
)


class VendorReportingService:
    @staticmethod
    async def build_annual_report(db: AsyncSession, *, year: int, current_user: User) -> VendorAnnualReportData:
        now = datetime.now(UTC)
        dept_ids = get_user_department_ids(current_user)

        vendor_stmt = (
            select(Vendor)
            .where(Vendor.status == "active")
            .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
            .order_by(Vendor.name)
        )
        if dept_ids is not None:
            vendor_stmt = vendor_stmt.where(Vendor.department_id.in_(dept_ids))

        vendors = (await db.execute(vendor_stmt)).scalars().all()
        vendor_ids = [v.id for v in vendors]

        incidents_by_vendor: dict[int, list[VendorIncident]] = {vid: [] for vid in vendor_ids}
        major_breaches_count = 0
        major_incidents_count = 0

        if vendor_ids:
            incident_stmt = (
                select(VendorIncident)
                .where(VendorIncident.vendor_id.in_(vendor_ids))
                .where(VendorIncident.is_major == True)
            )
            incidents = (await db.execute(incident_stmt)).scalars().all()
            for i in incidents:
                occurred = i.occurred_at or i.created_at
                if not occurred:
                    continue
                occurred_year = (occurred.replace(tzinfo=UTC) if occurred.tzinfo is None else occurred.astimezone(UTC)).year
                if occurred_year != year:
                    continue
                incidents_by_vendor.setdefault(i.vendor_id, []).append(i)

        vendor_rows: list[VendorAnnualReportVendorRow] = []
        for v in vendors:
            majors = incidents_by_vendor.get(v.id, [])
            breaches = [m for m in majors if m.incident_type in ("contract_breach", "regulatory_breach")]
            incidents = [m for m in majors if m.incident_type in ("security", "operational")]
            major_breaches_count += len(breaches)
            major_incidents_count += len(incidents)

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
                    last_decided_at=v.last_decided_at,
                    next_reassessment_due_at=v.next_reassessment_due_at,
                    reassessment_cadence_months=int(v.reassessment_cadence_months or 36),
                    major_breaches_count=len(breaches),
                    major_incidents_count=len(incidents),
                    major_items_preview=[m.summary for m in majors[:3] if m.summary],
                )
            )

        overdue_reassessments_count = sum(
            1
            for v in vendors
            if v.next_reassessment_due_at
            and (v.next_reassessment_due_at.replace(tzinfo=UTC) if v.next_reassessment_due_at.tzinfo is None else v.next_reassessment_due_at.astimezone(UTC)) < now
        )

        missing_exit_plans_count = 0
        missing_contingency_plans_count = 0
        if vendor_ids:
            exit_stmt = select(VendorExitPlan.vendor_id).where(VendorExitPlan.vendor_id.in_(vendor_ids))
            contingency_stmt = select(VendorContingencyPlan.vendor_id).where(VendorContingencyPlan.vendor_id.in_(vendor_ids))
            exit_ids = set((await db.execute(exit_stmt)).scalars().all())
            contingency_ids = set((await db.execute(contingency_stmt)).scalars().all())
            missing_exit_plans_count = len([vid for vid in vendor_ids if vid not in exit_ids])
            missing_contingency_plans_count = len([vid for vid in vendor_ids if vid not in contingency_ids])

        process_eval = VendorAnnualReportProcessEvaluation(
            year=year,
            total_active_vendors=len(vendors),
            overdue_reassessments_count=overdue_reassessments_count,
            missing_exit_plans_count=missing_exit_plans_count,
            missing_contingency_plans_count=missing_contingency_plans_count,
            major_breaches_count=major_breaches_count,
            major_incidents_count=major_incidents_count,
        )

        return VendorAnnualReportData(
            year=year,
            generated_at=now,
            vendors=vendor_rows,
            process_evaluation=process_eval,
        )

    @staticmethod
    async def build_dora_register(db: AsyncSession, *, current_user: User) -> list[VendorDoraRegisterRow]:
        dept_ids = get_user_department_ids(current_user)
        vendor_stmt = (
            select(Vendor)
            .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
            .order_by(Vendor.name)
        )
        if dept_ids is not None:
            vendor_stmt = vendor_stmt.where(Vendor.department_id.in_(dept_ids))

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
                last_decided_at=v.last_decided_at,
                next_reassessment_due_at=v.next_reassessment_due_at,
                reassessment_cadence_months=int(v.reassessment_cadence_months or 36),
                replaceability=v.replaceability,
                has_alternative_providers=bool(v.has_alternative_providers),
            )
            for v in vendors
        ]

