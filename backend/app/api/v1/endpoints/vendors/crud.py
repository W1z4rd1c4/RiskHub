from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.mappers.vendor import vendor_list_response, vendor_to_read
from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import coerce_utc
from app.core.permissions import can_read_vendor, check_department_access, get_user_department_ids, is_vendor_owner
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.vendor import (
    VendorCreate,
    VendorListResponse,
    VendorRead,
    VendorStatusEnum,
    VendorTypeEnum,
    VendorUpdate,
)
from app.services.vendor_reassessment_service import VendorReassessmentService

from ._shared import _get_vendor_with_deps

router = APIRouter()


@router.get("", response_model=VendorListResponse)
async def list_vendors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    status_filter: Optional[VendorStatusEnum] = Query(None, alias="status"),
    include_archived: bool = Query(False, description="Include archived vendors (inactive status)"),
    vendor_type: Optional[VendorTypeEnum] = None,
    dora_relevant: Optional[bool] = None,
    supports_important_core_insurance_function: Optional[bool] = None,
    is_significant_vendor: Optional[bool] = None,
    outsourcing_owner_user_id: Optional[int] = None,
    department_id: Optional[int] = None,
    process: Optional[str] = None,
    subprocess: Optional[str] = None,
    risk_score_1_5: Optional[int] = Query(None, ge=1, le=5),
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = Query("asc"),
):
    base_query = select(Vendor)

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        if dept_ids:
            base_query = base_query.where(
                or_(
                    Vendor.department_id.in_(dept_ids),
                    Vendor.outsourcing_owner_user_id == current_user.id,
                )
            )
        else:
            base_query = base_query.where(Vendor.outsourcing_owner_user_id == current_user.id)

        base_query = base_query.where(Vendor.department_id.is_not(None))
    elif department_id is not None:
        base_query = base_query.where(Vendor.department_id == department_id)

    if status_filter is not None:
        base_query = base_query.where(Vendor.status == status_filter.value)
    elif not include_archived:
        base_query = base_query.where(Vendor.status == VendorStatusEnum.active.value)
    if vendor_type is not None:
        base_query = base_query.where(Vendor.vendor_type == vendor_type.value)
    if dora_relevant is not None:
        base_query = base_query.where(Vendor.dora_relevant == dora_relevant)
    if supports_important_core_insurance_function is not None:
        base_query = base_query.where(
            Vendor.supports_important_core_insurance_function == supports_important_core_insurance_function
        )
    if is_significant_vendor is not None:
        base_query = base_query.where(Vendor.is_significant_vendor == is_significant_vendor)
    if outsourcing_owner_user_id is not None:
        base_query = base_query.where(Vendor.outsourcing_owner_user_id == outsourcing_owner_user_id)
    if process is not None:
        base_query = base_query.where(Vendor.process == process)
    if subprocess is not None:
        base_query = base_query.where(Vendor.subprocess == subprocess)
    if risk_score_1_5 is not None:
        base_query = base_query.where(Vendor.risk_score_1_5 == risk_score_1_5)

    if search:
        pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Vendor.name.ilike(pattern),
                Vendor.legal_name.ilike(pattern),
                Vendor.registration_id.ilike(pattern),
                Vendor.process.ilike(pattern),
            )
        )

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    order_column = Vendor.name
    if sort_by:
        if sort_by == "name":
            order_column = Vendor.name
        elif sort_by == "status":
            order_column = Vendor.status
        elif sort_by == "vendor_type":
            order_column = Vendor.vendor_type
        elif sort_by == "risk_score_1_5":
            order_column = Vendor.risk_score_1_5
        elif sort_by == "process":
            order_column = Vendor.process
        elif sort_by == "created_at":
            order_column = Vendor.created_at

    if sort_order == "desc":
        base_query = base_query.order_by(desc(order_column))
    else:
        base_query = base_query.order_by(asc(order_column))

    query = (
        base_query.options(
            selectinload(Vendor.department),
            selectinload(Vendor.outsourcing_owner),
        )
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    vendors = result.scalars().all()

    return vendor_list_response(vendors=vendors, total=total, skip=skip, limit=limit)


@router.post("", response_model=VendorRead, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    payload: VendorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "write")),
):
    check_department_access(payload.department_id, current_user)

    vendor = Vendor(**payload.model_dump())
    cadence = 12 if vendor.supports_important_core_insurance_function else 36
    vendor.reassessment_cadence_months = cadence
    vendor.next_reassessment_due_at = VendorReassessmentService.compute_next_due(
        base=datetime.now(UTC),
        cadence_months=cadence,
    )
    db.add(vendor)
    await db.commit()
    await db.refresh(vendor)

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=vendor.department_id,
        description=f"Created vendor {vendor.name}",
    )
    await db.commit()

    result = await db.execute(
        select(Vendor)
        .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
        .where(Vendor.id == vendor.id)
    )
    vendor = result.scalar_one()
    return vendor_to_read(vendor)


@router.get("/{vendor_id}", response_model=VendorRead)
async def get_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    vendor = await _get_vendor_with_deps(db, vendor_id)
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    if not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    return vendor_to_read(vendor)


@router.patch("/{vendor_id}", response_model=VendorRead)
async def update_vendor(
    vendor_id: int,
    payload: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await _get_vendor_with_deps(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    is_owner = is_vendor_owner(vendor, current_user)
    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    if not updates:
        return vendor_to_read(vendor)

    restricted_fields = {"department_id", "outsourcing_owner_user_id", "status"}
    restricted_fields |= {
        "reassessment_cadence_months",
        "next_reassessment_due_at",
        "last_assessed_at",
        "last_decided_at",
        "last_reassessment_reminded_at",
        "reassessment_triggered_reason",
        "reassessment_triggered_at",
    }
    if not can_write and (restricted_fields & set(updates.keys())):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to change governance fields"
        )

    if can_write and "department_id" in updates:
        check_department_access(updates["department_id"], current_user)

    changes = build_change_set(vendor, updates)
    for field, value in updates.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(vendor, field, value)

    if can_write and "supports_important_core_insurance_function" in updates:
        if "reassessment_cadence_months" not in updates:
            vendor.reassessment_cadence_months = 12 if vendor.supports_important_core_insurance_function else 36
        if "next_reassessment_due_at" not in updates:
            base = vendor.last_decided_at or vendor.created_at or datetime.now(UTC)
            base = coerce_utc(base) or base
            vendor.next_reassessment_due_at = VendorReassessmentService.compute_next_due(
                base=base,
                cadence_months=vendor.reassessment_cadence_months,
            )

    await db.commit()
    await db.refresh(vendor)

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=vendor.department_id,
        changes=changes,
    )
    await db.commit()

    vendor = await _get_vendor_with_deps(db, vendor.id)
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor_to_read(vendor)
