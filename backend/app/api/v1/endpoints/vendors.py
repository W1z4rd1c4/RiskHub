from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, func, asc, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import User, Vendor
from app.schemas.vendor import VendorCreate, VendorUpdate, VendorRead, VendorListResponse, VendorStatusEnum, VendorTypeEnum
from app.api import deps
from app.core.permissions import get_user_department_ids, check_department_access
from app.core.security import require_permission, check_permission
from app.core.activity_logger import log_activity, build_change_set
from app.models.activity_log import ActivityAction, ActivityEntityType

router = APIRouter()


def _can_read_vendor(vendor: Vendor, user: User) -> bool:
    if vendor.department_id is None:
        return get_user_department_ids(user) is None

    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return True
    if vendor.department_id in dept_ids:
        return True
    return vendor.outsourcing_owner_user_id == user.id


@router.get("", response_model=VendorListResponse)
async def list_vendors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    status_filter: Optional[VendorStatusEnum] = Query(None, alias="status"),
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

    query = base_query.options(
        selectinload(Vendor.department),
        selectinload(Vendor.outsourcing_owner),
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    vendors = result.scalars().all()

    items = [
        {
            **{c.name: getattr(v, c.name) for c in Vendor.__table__.columns},
            "department_name": v.department.name if v.department else None,
            "outsourcing_owner_name": v.outsourcing_owner.name if v.outsourcing_owner else None,
        }
        for v in vendors
    ]

    return VendorListResponse(items=items, total=total, skip=skip, limit=limit)


@router.post("", response_model=VendorRead, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    payload: VendorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "write")),
):
    check_department_access(payload.department_id, current_user)

    vendor = Vendor(**payload.model_dump())
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
    return {
        **{c.name: getattr(vendor, c.name) for c in Vendor.__table__.columns},
        "department_name": vendor.department.name if vendor.department else None,
        "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else None,
    }


@router.get("/{vendor_id}", response_model=VendorRead)
async def get_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    result = await db.execute(
        select(Vendor)
        .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
        .where(Vendor.id == vendor_id)
    )
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    if not _can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    return {
        **{c.name: getattr(vendor, c.name) for c in Vendor.__table__.columns},
        "department_name": vendor.department.name if vendor.department else None,
        "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else None,
    }


@router.patch("/{vendor_id}", response_model=VendorRead)
async def update_vendor(
    vendor_id: int,
    payload: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    result = await db.execute(
        select(Vendor)
        .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
        .where(Vendor.id == vendor_id)
    )
    vendor = result.scalar_one_or_none()
    if not vendor or not _can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    is_owner = vendor.outsourcing_owner_user_id == current_user.id
    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        return {
            **{c.name: getattr(vendor, c.name) for c in Vendor.__table__.columns},
            "department_name": vendor.department.name if vendor.department else None,
            "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else None,
        }

    restricted_fields = {"department_id", "outsourcing_owner_user_id", "status"}
    if not can_write and (restricted_fields & set(updates.keys())):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to change governance fields")

    if can_write and "department_id" in updates:
        check_department_access(updates["department_id"], current_user)

    changes = build_change_set(vendor, updates)
    for field, value in updates.items():
        if hasattr(value, "value"):
            value = value.value
        setattr(vendor, field, value)

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

    return {
        **{c.name: getattr(vendor, c.name) for c in Vendor.__table__.columns},
        "department_name": vendor.department.name if vendor.department else None,
        "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else None,
    }


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "delete"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:delete")

    result = await db.execute(
        select(Vendor)
        .options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
        .where(Vendor.id == vendor_id)
    )
    vendor = result.scalar_one_or_none()
    if not vendor or not _can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    changes = build_change_set(vendor, {"status": "inactive"})
    vendor.status = "inactive"
    await db.commit()
    await db.refresh(vendor)

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        action=ActivityAction.ARCHIVE,
        actor=current_user,
        department_id=vendor.department_id,
        changes=changes,
        description=f"Archived vendor {vendor.name}",
    )
    await db.commit()
    return None

