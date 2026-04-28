from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.mappers.vendor import vendor_list_response, vendor_to_read
from app.api.v1.endpoints._collection import (
    build_grouped_collection_page,
    parse_collection_query,
)
from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User, Vendor, VendorRiskLink
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.vendor import (
    VendorCreate,
    VendorListResponse,
    VendorRead,
    VendorStatusEnum,
    VendorTypeEnum,
    VendorUpdate,
)
from app.services._vendor_workflow import (
    load_vendor_for_update,
    validate_vendor_governance_assignment,
)

from ._listing import (
    apply_vendor_list_filters,
    coerce_vendor_list_criteria,
    serialize_vendor_linked_risks,
    serialize_vendor_reads,
    vendor_group_entries,
    vendor_order_column,
)
from ._listing import (
    get_visible_risk_ids as _get_visible_risk_ids,
)
from ._shared import _get_vendor_with_deps

router = APIRouter()


@router.get("", response_model=VendorListResponse)
async def list_vendors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
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
    sort: str | None = Query(None),
    filters: str | None = Query(None),
    group_by: str | None = Query(None),
    group_value: str | None = Query(None),
):
    collection_query = parse_collection_query(
        offset=skip if skip is not None else offset,
        limit=limit,
        sort=sort,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        max_limit=100,
    )
    criteria = coerce_vendor_list_criteria(
        collection_query,
        search=search,
        status_filter=status_filter,
        include_archived=include_archived,
        vendor_type=vendor_type,
        dora_relevant=dora_relevant,
        supports_important_core_insurance_function=supports_important_core_insurance_function,
        is_significant_vendor=is_significant_vendor,
        outsourcing_owner_user_id=outsourcing_owner_user_id,
        department_id=department_id,
        process=process,
        subprocess=subprocess,
        risk_score_1_5=risk_score_1_5,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    can_read_risks = check_permission(current_user, "risks", "read")
    collection_capabilities = {
        "can_create": check_permission(current_user, "vendors", "write"),
        "can_export": check_permission(current_user, "reports", "read"),
        "can_view_risk_contexts": can_read_risks,
    }
    base_query = apply_vendor_list_filters(select(Vendor), current_user, criteria)

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    order_column = vendor_order_column(criteria.sort_by)
    if criteria.sort_order == "desc":
        base_query = base_query.order_by(desc(order_column))
    else:
        base_query = base_query.order_by(asc(order_column))

    query_options = (
        selectinload(Vendor.department),
        selectinload(Vendor.outsourcing_owner),
        selectinload(Vendor.risk_links).selectinload(VendorRiskLink.risk),
    )

    ordered_query = base_query.options(*query_options)

    if collection_query.group_by:
        result = await db.execute(ordered_query)
        all_items = await serialize_vendor_reads(
            db,
            list(result.scalars().all()),
            current_user=current_user,
            can_read_risks=can_read_risks,
        )
        paginated_items, grouped_total, groups = build_grouped_collection_page(
            all_items,
            collection_query,
            get_entries=vendor_group_entries,
            is_active=lambda vendor: vendor.status == VendorStatusEnum.active,
            is_highlighted=lambda vendor: vendor.risk_score_1_5 >= 4,
        )
        return VendorListResponse(
            items=paginated_items,
            total=grouped_total,
            offset=criteria.offset,
            limit=criteria.limit,
            groups=groups,
            capabilities=collection_capabilities,
        )

    result = await db.execute(ordered_query.offset(criteria.offset).limit(criteria.limit))
    vendors = result.scalars().all()

    visible_risk_ids = (
        await _get_visible_risk_ids(db, current_user=current_user, vendors=list(vendors)) if can_read_risks else set()
    )
    linked_risks_by_vendor_id = serialize_vendor_linked_risks(list(vendors), visible_risk_ids=visible_risk_ids)

    return vendor_list_response(
        vendors=list(vendors),
        total=total,
        offset=criteria.offset,
        limit=criteria.limit,
        current_user=current_user,
        linked_risks_by_vendor_id=linked_risks_by_vendor_id,
        capabilities=collection_capabilities,
    )


@router.post("", response_model=VendorRead, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    payload: VendorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "write")),
):
    await validate_vendor_governance_assignment(
        db,
        current_user=current_user,
        department_id=payload.department_id,
        owner_user_id=payload.outsourcing_owner_user_id,
    )

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
    return vendor_to_read(vendor, current_user=current_user)


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

    return vendor_to_read(vendor, current_user=current_user)


@router.patch("/{vendor_id}", response_model=VendorRead)
async def update_vendor(
    vendor_id: int,
    payload: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await load_vendor_for_update(db, vendor_id)
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    if vendor.status == VendorStatusEnum.inactive.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot update inactive vendor")

    is_owner = is_vendor_owner(vendor, current_user)
    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")

    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    if not updates:
        return vendor_to_read(vendor, current_user=current_user)

    restricted_fields = {"department_id", "outsourcing_owner_user_id", "status"}
    if not can_write and (restricted_fields & set(updates.keys())):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to change governance fields"
        )

    next_department_id = updates.get("department_id", vendor.department_id)
    next_owner_user_id = updates.get("outsourcing_owner_user_id", vendor.outsourcing_owner_user_id)
    if can_write and ({"department_id", "outsourcing_owner_user_id"} & set(updates.keys())):
        await validate_vendor_governance_assignment(
            db,
            current_user=current_user,
            department_id=next_department_id,
            owner_user_id=next_owner_user_id,
        )

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

    vendor = await _get_vendor_with_deps(db, vendor.id)
    if not vendor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor_to_read(vendor, current_user=current_user)
