from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, asc, case, desc, false, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.mappers.vendor import vendor_list_response, vendor_to_read
from app.api.v1.endpoints._collection import (
    is_group_summary_request,
    parse_collection_query,
)
from app.api.v1.endpoints._collection_execution import (
    apply_collection_group_filter,
    build_collection_response,
    count_collection_rows,
    load_collection_scalars_page,
)
from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import can_read_vendor, is_vendor_owner, risk_visibility_clause
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import Department, Risk, User, Vendor, VendorRiskLink
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.collection import CollectionGroupRead
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
    VENDOR_GROUP_DORA_RELEVANT,
    VENDOR_GROUP_INSIGNIFICANT_VENDOR,
    VENDOR_GROUP_NO_PROCESS,
    VENDOR_GROUP_SIGNIFICANT_VENDOR,
    VENDOR_GROUP_SUPPORTS_CORE_FUNCTION,
    VENDOR_GROUP_UNASSIGNED,
    VENDOR_GROUP_UNLINKED_RISK,
    apply_vendor_list_filters,
    coerce_vendor_list_criteria,
    serialize_vendor_linked_risks,
    vendor_order_column,
)
from ._listing import (
    get_visible_risk_ids as _get_visible_risk_ids,
)
from ._shared import _get_vendor_with_deps

router = APIRouter()


def _vendor_group_counts() -> tuple:
    return (
        func.count(func.distinct(Vendor.id)).label("count"),
        func.count(
            func.distinct(case((Vendor.status == VendorStatusEnum.active.value, Vendor.id), else_=None))
        ).label("active_count"),
        func.count(func.distinct(case((Vendor.risk_score_1_5 >= 4, Vendor.id), else_=None))).label(
            "highlighted_count"
        ),
    )


def _vendor_group_rows_to_reads(rows) -> list[CollectionGroupRead]:
    return [
        CollectionGroupRead(
            value=row.value,
            label=row.label,
            count=row.count,
            active_count=row.active_count,
            highlighted_count=row.highlighted_count,
        )
        for row in rows
    ]


async def _visible_vendor_risk_context(
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    *,
    can_read_risks: bool,
):
    query = (
        select(
            VendorRiskLink.vendor_id.label("vendor_id"),
            Risk.id.label("risk_id"),
            Risk.risk_id_code.label("risk_id_code"),
            Risk.name.label("risk_name"),
        )
        .select_from(VendorRiskLink)
        .join(filtered_ids, filtered_ids.c.id == VendorRiskLink.vendor_id)
        .join(Risk, Risk.id == VendorRiskLink.risk_id)
    )
    risk_visibility = await risk_visibility_clause(db, current_user) if can_read_risks else false()
    if risk_visibility is not None:
        query = query.where(risk_visibility)
    return query.subquery()


def _vendor_flag_membership_query(filtered_ids):
    def flag_select(value: str, condition):
        return (
            select(
                literal(value).label("value"),
                literal(value).label("label"),
                Vendor.id.label("vendor_id"),
                Vendor.status.label("status"),
                Vendor.risk_score_1_5.label("risk_score_1_5"),
            )
            .join(filtered_ids, filtered_ids.c.id == Vendor.id)
            .where(condition)
        )

    return union_all(
        flag_select(VENDOR_GROUP_DORA_RELEVANT, Vendor.dora_relevant.is_(True)),
        flag_select(
            VENDOR_GROUP_SUPPORTS_CORE_FUNCTION,
            Vendor.supports_important_core_insurance_function.is_(True),
        ),
        flag_select(VENDOR_GROUP_SIGNIFICANT_VENDOR, Vendor.is_significant_vendor.is_(True)),
        flag_select(
            VENDOR_GROUP_INSIGNIFICANT_VENDOR,
            Vendor.dora_relevant.is_(False),
        ).where(
            Vendor.supports_important_core_insurance_function.is_(False),
            Vendor.is_significant_vendor.is_(False),
        ),
    ).subquery()


async def _load_vendor_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    current_user: User,
    can_read_risks: bool,
) -> list[CollectionGroupRead]:
    query = select(Vendor).join(filtered_ids, filtered_ids.c.id == Vendor.id)

    if group_by == "department":
        query = query.outerjoin(Department, Department.id == Vendor.department_id)
        value_expr = func.coalesce(Department.name, literal(VENDOR_GROUP_UNASSIGNED))
        label_expr = value_expr
    elif group_by == "process":
        value_expr = func.coalesce(func.nullif(Vendor.process, ""), literal(VENDOR_GROUP_NO_PROCESS))
        label_expr = value_expr
    elif group_by == "type":
        value_expr = Vendor.vendor_type
        label_expr = Vendor.vendor_type
    elif group_by == "risk":
        risk_context = await _visible_vendor_risk_context(
            db,
            filtered_ids,
            current_user,
            can_read_risks=can_read_risks,
        )
        query = query.outerjoin(risk_context, risk_context.c.vendor_id == Vendor.id)
        value_expr = func.coalesce(
            literal("risk:") + func.cast(risk_context.c.risk_id, String),
            literal(VENDOR_GROUP_UNLINKED_RISK),
        )
        label_expr = func.coalesce(
            risk_context.c.risk_id_code + literal(": ") + risk_context.c.risk_name,
            literal(VENDOR_GROUP_UNLINKED_RISK),
        )
    elif group_by == "flag":
        flag_rows = _vendor_flag_membership_query(filtered_ids)
        rows = (
            (
                await db.execute(
                    select(
                        flag_rows.c.value,
                        flag_rows.c.label,
                        func.count(func.distinct(flag_rows.c.vendor_id)).label("count"),
                        func.count(
                            func.distinct(
                                case(
                                    (flag_rows.c.status == VendorStatusEnum.active.value, flag_rows.c.vendor_id),
                                    else_=None,
                                )
                            )
                        ).label("active_count"),
                        func.count(
                            func.distinct(
                                case((flag_rows.c.risk_score_1_5 >= 4, flag_rows.c.vendor_id), else_=None)
                            )
                        ).label("highlighted_count"),
                    )
                    .group_by(flag_rows.c.value, flag_rows.c.label)
                    .order_by(flag_rows.c.label)
                )
            )
            .mappings()
            .all()
        )
        return _vendor_group_rows_to_reads(rows)
    else:
        return []

    rows = (
        (
            await db.execute(
                query.with_only_columns(
                    value_expr.label("value"),
                    label_expr.label("label"),
                    *_vendor_group_counts(),
                )
                .group_by(value_expr, label_expr)
                .order_by(label_expr)
            )
        )
        .mappings()
        .all()
    )
    return _vendor_group_rows_to_reads(rows)


def _vendor_group_value_filter(group_by: str, group_value: str, *, risk_context=None):
    if group_by == "department":
        if group_value == VENDOR_GROUP_UNASSIGNED:
            return Vendor.department_id.is_(None)
        return Vendor.department.has(Department.name == group_value)
    if group_by == "process":
        if group_value == VENDOR_GROUP_NO_PROCESS:
            return or_(Vendor.process.is_(None), Vendor.process == "")
        return Vendor.process == group_value
    if group_by == "type":
        return Vendor.vendor_type == group_value
    if group_by == "flag":
        if group_value == VENDOR_GROUP_DORA_RELEVANT:
            return Vendor.dora_relevant.is_(True)
        if group_value == VENDOR_GROUP_SUPPORTS_CORE_FUNCTION:
            return Vendor.supports_important_core_insurance_function.is_(True)
        if group_value == VENDOR_GROUP_SIGNIFICANT_VENDOR:
            return Vendor.is_significant_vendor.is_(True)
        if group_value == VENDOR_GROUP_INSIGNIFICANT_VENDOR:
            return (
                Vendor.dora_relevant.is_(False)
                & Vendor.supports_important_core_insurance_function.is_(False)
                & Vendor.is_significant_vendor.is_(False)
            )
        return Vendor.id.is_(None)
    if group_by == "risk" and group_value.startswith("risk:"):
        try:
            risk_id = int(group_value.removeprefix("risk:"))
        except ValueError:
            return Vendor.id.is_(None)
        if risk_context is None:
            return Vendor.id.is_(None)
        return Vendor.id.in_(select(risk_context.c.vendor_id).where(risk_context.c.risk_id == risk_id))
    if group_by == "risk" and group_value == VENDOR_GROUP_UNLINKED_RISK and risk_context is not None:
        return ~Vendor.id.in_(select(risk_context.c.vendor_id))
    return None


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

    filtered_vendor_ids = base_query.with_only_columns(Vendor.id).order_by(None).subquery()

    if collection_query.group_by:
        groups = await _load_vendor_sql_groups(
            db,
            filtered_vendor_ids,
            collection_query.group_by,
            current_user=current_user,
            can_read_risks=can_read_risks,
        )
        if is_group_summary_request(collection_query):
            return build_collection_response(
                VendorListResponse,
                query=collection_query,
                items=[],
                total=total,
                groups=groups,
                capabilities=collection_capabilities,
            )

        risk_context = (
            await _visible_vendor_risk_context(
                db,
                filtered_vendor_ids,
                current_user,
                can_read_risks=can_read_risks,
            )
            if collection_query.group_by == "risk"
            else None
        )
        group_filter = _vendor_group_value_filter(
            collection_query.group_by,
            collection_query.group_value or "",
            risk_context=risk_context,
        )
        grouped_base_query = apply_collection_group_filter(base_query, group_filter)
        grouped_count = await count_collection_rows(db, grouped_base_query)
        grouped_order = desc(order_column) if criteria.sort_order == "desc" else asc(order_column)
        grouped_query = grouped_base_query.order_by(grouped_order)
        grouped_query = grouped_query.options(*query_options)
        vendors = await load_collection_scalars_page(
            db,
            grouped_query,
            offset=criteria.offset,
            limit=criteria.limit,
        )
        visible_risk_ids = (
            await _get_visible_risk_ids(db, current_user=current_user, vendors=vendors)
            if can_read_risks
            else set()
        )
        linked_risks_by_vendor_id = serialize_vendor_linked_risks(vendors, visible_risk_ids=visible_risk_ids)
        items = vendor_list_response(
            vendors=vendors,
            total=grouped_count,
            offset=criteria.offset,
            limit=criteria.limit,
            current_user=current_user,
            linked_risks_by_vendor_id=linked_risks_by_vendor_id,
            capabilities=collection_capabilities,
        ).items
        return build_collection_response(
            VendorListResponse,
            query=collection_query,
            items=items,
            total=grouped_count,
            groups=groups,
            capabilities=collection_capabilities,
        )

    ordered_query = base_query.options(*query_options)
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
