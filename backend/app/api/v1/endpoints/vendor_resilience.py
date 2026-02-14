from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User, Vendor
from app.models.vendor_contingency_plan import VendorContingencyPlan
from app.models.vendor_exit_plan import VendorExitPlan, VendorPlanStatus
from app.schemas.vendor_resilience import (
    VendorContingencyPlanRead,
    VendorExitPlanRead,
    VendorResilienceRead,
    VendorResilienceUpdate,
)

router = APIRouter()


def _contingency_required(plan: VendorContingencyPlan | None) -> bool:
    if not plan:
        return False
    if (plan.max_tolerable_outage_hours or 0) > 24:
        return True
    return bool(plan.impact_confidentiality or plan.impact_integrity or plan.impact_authenticity or plan.impact_availability)


def _missing_exit_plan(*, required: bool, plan: VendorExitPlan | None) -> bool:
    if not required:
        return False
    if not plan:
        return True
    return plan.status != VendorPlanStatus.complete


def _missing_contingency_plan(*, required: bool, plan: VendorContingencyPlan | None) -> bool:
    if not required:
        return False
    if not plan:
        return True
    return plan.status != VendorPlanStatus.complete


async def _get_vendor_or_404(db: AsyncSession, vendor_id: int, current_user: User) -> Vendor:
    result = await db.execute(
        select(Vendor)
        .options(
            selectinload(Vendor.exit_plan),
            selectinload(Vendor.contingency_plan),
        )
        .where(Vendor.id == vendor_id)
    )
    vendor = result.scalar_one_or_none()
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


@router.get("/vendors/{vendor_id}/resilience", response_model=VendorResilienceRead)
async def get_vendor_resilience(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    required = bool(vendor.supports_important_core_insurance_function)
    contingency_required = required and _contingency_required(vendor.contingency_plan)

    return VendorResilienceRead(
        vendor_id=vendor.id,
        is_required=required,
        contingency_required=contingency_required,
        exit_plan=(
            VendorExitPlanRead(
                status=vendor.exit_plan.status.value,
                plan_reference=vendor.exit_plan.plan_reference,
                notes=vendor.exit_plan.notes,
                last_reviewed_at=vendor.exit_plan.last_reviewed_at,
                last_tested_at=vendor.exit_plan.last_tested_at,
            )
            if vendor.exit_plan
            else None
        ),
        contingency_plan=(
            VendorContingencyPlanRead(
                max_tolerable_outage_hours=vendor.contingency_plan.max_tolerable_outage_hours,
                impact_confidentiality=vendor.contingency_plan.impact_confidentiality,
                impact_integrity=vendor.contingency_plan.impact_integrity,
                impact_authenticity=vendor.contingency_plan.impact_authenticity,
                impact_availability=vendor.contingency_plan.impact_availability,
                status=vendor.contingency_plan.status.value,
                plan_reference=vendor.contingency_plan.plan_reference,
                notes=vendor.contingency_plan.notes,
                last_reviewed_at=vendor.contingency_plan.last_reviewed_at,
                last_tested_at=vendor.contingency_plan.last_tested_at,
            )
            if vendor.contingency_plan
            else None
        ),
        missing_exit_plan=_missing_exit_plan(required=required, plan=vendor.exit_plan),
        missing_contingency_plan=_missing_contingency_plan(required=contingency_required, plan=vendor.contingency_plan),
    )


@router.patch("/vendors/{vendor_id}/resilience", response_model=VendorResilienceRead)
async def update_vendor_resilience(
    vendor_id: int,
    payload: VendorResilienceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    is_owner = is_vendor_owner(vendor, current_user)
    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    if payload.exit_plan is not None:
        if not vendor.exit_plan:
            vendor.exit_plan = VendorExitPlan(vendor_id=vendor.id, status=VendorPlanStatus.not_started)
            db.add(vendor.exit_plan)
        vendor.exit_plan.status = VendorPlanStatus(payload.exit_plan.status.value)
        vendor.exit_plan.plan_reference = payload.exit_plan.plan_reference
        vendor.exit_plan.notes = payload.exit_plan.notes
        vendor.exit_plan.last_reviewed_at = payload.exit_plan.last_reviewed_at
        vendor.exit_plan.last_tested_at = payload.exit_plan.last_tested_at

    if payload.contingency_plan is not None:
        if not vendor.contingency_plan:
            vendor.contingency_plan = VendorContingencyPlan(vendor_id=vendor.id, status=VendorPlanStatus.not_started)
            db.add(vendor.contingency_plan)
        vendor.contingency_plan.max_tolerable_outage_hours = payload.contingency_plan.max_tolerable_outage_hours
        vendor.contingency_plan.impact_confidentiality = payload.contingency_plan.impact_confidentiality
        vendor.contingency_plan.impact_integrity = payload.contingency_plan.impact_integrity
        vendor.contingency_plan.impact_authenticity = payload.contingency_plan.impact_authenticity
        vendor.contingency_plan.impact_availability = payload.contingency_plan.impact_availability
        vendor.contingency_plan.status = VendorPlanStatus(payload.contingency_plan.status.value)
        vendor.contingency_plan.plan_reference = payload.contingency_plan.plan_reference
        vendor.contingency_plan.notes = payload.contingency_plan.notes
        vendor.contingency_plan.last_reviewed_at = payload.contingency_plan.last_reviewed_at
        vendor.contingency_plan.last_tested_at = payload.contingency_plan.last_tested_at

    required = bool(vendor.supports_important_core_insurance_function)
    if required and not vendor.exit_plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exit plan is required for critical/important vendors",
        )

    contingency_required = required and _contingency_required(vendor.contingency_plan)
    if contingency_required and not vendor.contingency_plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contingency plan is required when outage tolerance >24h or CIA impact is flagged",
        )

    await db.commit()
    return await get_vendor_resilience(vendor_id, db=db, current_user=current_user)
