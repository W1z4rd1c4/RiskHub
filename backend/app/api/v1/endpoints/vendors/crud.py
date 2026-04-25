from __future__ import annotations

import asyncio
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.mappers.vendor import vendor_list_response, vendor_to_read
from app.api.v1.endpoints._collection import (
    CollectionGroupEntry,
    build_grouped_collection_page,
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
    merge_collection_filters,
    parse_collection_query,
)
from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import can_read_risk_id, can_read_vendor, is_vendor_owner
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User, Vendor, VendorRiskLink
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.vendor import (
    VendorCreate,
    VendorLinkedRiskSummary,
    VendorListResponse,
    VendorRead,
    VendorStatusEnum,
    VendorTypeEnum,
    VendorUpdate,
)
from app.services._vendor_workflow import (
    apply_vendor_visibility_scope,
    load_vendor_for_update,
    validate_vendor_governance_assignment,
)

from ._shared import _get_vendor_with_deps

router = APIRouter()

VENDOR_GROUP_UNASSIGNED = "__unassigned__"
VENDOR_GROUP_NO_PROCESS = "__no_process__"
VENDOR_GROUP_UNLINKED_RISK = "__unlinked_risk__"
VENDOR_GROUP_DORA_RELEVANT = "__dora_relevant__"
VENDOR_GROUP_SUPPORTS_CORE_FUNCTION = "__supports_core_function__"
VENDOR_GROUP_SIGNIFICANT_VENDOR = "__significant_vendor__"
VENDOR_GROUP_INSIGNIFICANT_VENDOR = "__insignificant_vendor__"


def _vendor_group_entries(vendor: VendorRead, group_by: str) -> list[CollectionGroupEntry]:
    if group_by == "department":
        value = vendor.department_name or VENDOR_GROUP_UNASSIGNED
        return [CollectionGroupEntry(value, value)]

    if group_by == "process":
        value = vendor.process or VENDOR_GROUP_NO_PROCESS
        return [CollectionGroupEntry(value, value)]

    if group_by == "type":
        return [CollectionGroupEntry(vendor.vendor_type.value, vendor.vendor_type.value)]

    if group_by == "risk":
        linked_risks = vendor.linked_risks or []
        if not linked_risks:
            return [CollectionGroupEntry(VENDOR_GROUP_UNLINKED_RISK, VENDOR_GROUP_UNLINKED_RISK)]
        return [
            CollectionGroupEntry(f"risk:{risk.risk_id}", f"{risk.risk_id_code}: {risk.risk_name}")
            for risk in linked_risks
        ]

    if group_by == "flag":
        entries: list[CollectionGroupEntry] = []
        if vendor.dora_relevant:
            entries.append(CollectionGroupEntry(VENDOR_GROUP_DORA_RELEVANT, VENDOR_GROUP_DORA_RELEVANT))
        if vendor.supports_important_core_insurance_function:
            entries.append(
                CollectionGroupEntry(VENDOR_GROUP_SUPPORTS_CORE_FUNCTION, VENDOR_GROUP_SUPPORTS_CORE_FUNCTION)
            )
        if vendor.is_significant_vendor:
            entries.append(CollectionGroupEntry(VENDOR_GROUP_SIGNIFICANT_VENDOR, VENDOR_GROUP_SIGNIFICANT_VENDOR))
        if not entries:
            entries.append(CollectionGroupEntry(VENDOR_GROUP_INSIGNIFICANT_VENDOR, VENDOR_GROUP_INSIGNIFICANT_VENDOR))
        return entries

    return []


async def _get_visible_risk_ids(
    db: AsyncSession,
    *,
    current_user: User,
    vendors: list[Vendor],
) -> set[int]:
    unique_risk_ids = {
        link.risk_id
        for vendor in vendors
        for link in getattr(vendor, "risk_links", []) or []
        if getattr(link, "risk", None) is not None
    }
    if not unique_risk_ids:
        return set()

    ordered_risk_ids = sorted(unique_risk_ids)
    visibility_results = await asyncio.gather(
        *(can_read_risk_id(db, current_user, risk_id) for risk_id in ordered_risk_ids)
    )
    return {risk_id for risk_id, can_read in zip(ordered_risk_ids, visibility_results, strict=False) if can_read}


def _serialize_vendor_linked_risks(
    vendors: list[Vendor],
    *,
    visible_risk_ids: set[int],
) -> dict[int, list[VendorLinkedRiskSummary]]:
    linked_risks_by_vendor_id: dict[int, list[VendorLinkedRiskSummary]] = {}

    for vendor in vendors:
        summaries: list[VendorLinkedRiskSummary] = []
        for link in getattr(vendor, "risk_links", []) or []:
            risk = getattr(link, "risk", None)
            if not risk or risk.id not in visible_risk_ids:
                continue
            summaries.append(
                VendorLinkedRiskSummary(
                    risk_id=risk.id,
                    risk_id_code=risk.risk_id_code,
                    risk_name=risk.name,
                )
            )
        linked_risks_by_vendor_id[vendor.id] = summaries

    return linked_risks_by_vendor_id


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
    filter_values = merge_collection_filters(
        collection_query,
        {
            "search": search,
            "status": status_filter.value if status_filter else None,
            "include_archived": include_archived,
            "vendor_type": vendor_type.value if vendor_type else None,
            "dora_relevant": dora_relevant,
            "supports_important_core_insurance_function": supports_important_core_insurance_function,
            "is_significant_vendor": is_significant_vendor,
            "outsourcing_owner_user_id": outsourcing_owner_user_id,
            "department_id": department_id,
            "process": process,
            "subprocess": subprocess,
            "risk_score_1_5": risk_score_1_5,
        },
    )
    search = coerce_optional_string("search", filter_values.get("search"))
    status_value = filter_values.get("status")
    status_filter = coerce_optional_enum(VendorStatusEnum, status_value, "status")
    include_archived = coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False
    vendor_type_value = filter_values.get("vendor_type")
    vendor_type = coerce_optional_enum(VendorTypeEnum, vendor_type_value, "vendor_type")
    dora_relevant = coerce_optional_bool("dora_relevant", filter_values.get("dora_relevant"))
    supports_important_core_insurance_function = coerce_optional_bool(
        "supports_important_core_insurance_function",
        filter_values.get("supports_important_core_insurance_function"),
    )
    is_significant_vendor = coerce_optional_bool(
        "is_significant_vendor", filter_values.get("is_significant_vendor")
    )
    outsourcing_owner_user_id = coerce_optional_int(
        "outsourcing_owner_user_id", filter_values.get("outsourcing_owner_user_id")
    )
    department_id = coerce_optional_int("department_id", filter_values.get("department_id"))
    process = coerce_optional_string("process", filter_values.get("process"))
    subprocess = coerce_optional_string("subprocess", filter_values.get("subprocess"))
    risk_score_1_5 = coerce_optional_int(
        "risk_score_1_5", filter_values.get("risk_score_1_5"), min_value=1, max_value=5
    )
    offset = collection_query.offset
    limit = collection_query.limit
    sort_by = collection_query.sort.field if collection_query.sort else sort_by
    sort_order = collection_query.sort.direction if collection_query.sort else sort_order

    can_read_risks = check_permission(current_user, "risks", "read")
    base_query = select(Vendor)

    base_query = apply_vendor_visibility_scope(base_query, current_user, department_id=department_id)

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

    order_column: Any = Vendor.name
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

    query_options = (
        selectinload(Vendor.department),
        selectinload(Vendor.outsourcing_owner),
        selectinload(Vendor.risk_links).selectinload(VendorRiskLink.risk),
    )

    ordered_query = base_query.options(*query_options)

    async def serialize_vendors(vendors: list[Vendor]) -> list[VendorRead]:
        visible_risk_ids = (
            await _get_visible_risk_ids(db, current_user=current_user, vendors=vendors) if can_read_risks else set()
        )
        linked_risks_by_vendor_id = _serialize_vendor_linked_risks(vendors, visible_risk_ids=visible_risk_ids)
        return [
            vendor_to_read(
                vendor,
                current_user=current_user,
                linked_risks=linked_risks_by_vendor_id.get(vendor.id, []),
            )
            for vendor in vendors
        ]

    if collection_query.group_by:
        result = await db.execute(ordered_query)
        all_items = await serialize_vendors(list(result.scalars().all()))
        paginated_items, grouped_total, groups = build_grouped_collection_page(
            all_items,
            collection_query,
            get_entries=_vendor_group_entries,
            is_active=lambda vendor: vendor.status == VendorStatusEnum.active,
            is_highlighted=lambda vendor: vendor.risk_score_1_5 >= 4,
        )
        return VendorListResponse(
            items=paginated_items,
            total=grouped_total,
            offset=offset,
            limit=limit,
            groups=groups,
        )

    result = await db.execute(ordered_query.offset(offset).limit(limit))
    vendors = result.scalars().all()

    visible_risk_ids = (
        await _get_visible_risk_ids(db, current_user=current_user, vendors=list(vendors)) if can_read_risks else set()
    )
    linked_risks_by_vendor_id = _serialize_vendor_linked_risks(list(vendors), visible_risk_ids=visible_risk_ids)

    return vendor_list_response(
        vendors=list(vendors),
        total=total,
        offset=offset,
        limit=limit,
        current_user=current_user,
        linked_risks_by_vendor_id=linked_risks_by_vendor_id,
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
