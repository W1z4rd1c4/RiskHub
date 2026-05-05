from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

from fastapi import HTTPException
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import check_permission
from app.models import User, Vendor, VendorRiskLink
from app.schemas.vendor import VendorListResponse, VendorStatusEnum, VendorTypeEnum
from app.services._collection_contracts import CollectionQuery
from app.services._register_listings.lifecycle import execute_register_listing_plan
from app.services._register_listings.vendors import plan_vendor_listing
from app.services._vendor_workflow import apply_vendor_visibility_scope

from .projection import get_visible_vendor_risk_ids, serialize_vendor_list_items, serialize_vendor_reads


@dataclass(frozen=True)
class VendorListingGovernance:
    criteria: Any
    group_by: str | None = None
    drilldown_group: str | None = None


@dataclass(frozen=True)
class VendorListCriteria:
    offset: int
    limit: int
    search: str | None
    status_filter: VendorStatusEnum | None
    include_archived: bool
    vendor_type: VendorTypeEnum | None
    dora_relevant: bool | None
    supports_important_core_insurance_function: bool | None
    is_significant_vendor: bool | None
    outsourcing_owner_user_id: int | None
    department_id: int | None
    process: str | None
    subprocess: str | None
    risk_score_1_5: int | None
    sort_by: str | None
    sort_order: str | None


def build_vendor_collection_capabilities(current_user: User, *, check_permission_fn=check_permission) -> dict[str, bool]:
    return {
        "can_create": check_permission_fn(current_user, "vendors", "write"),
        "can_export": check_permission_fn(current_user, "reports", "read"),
        "can_view_risk_contexts": check_permission_fn(current_user, "risks", "read"),
    }


def merge_collection_filters(query: CollectionQuery, defaults: dict[str, Any]) -> dict[str, Any]:
    return defaults | query.filters


def _invalid_filter(field_name: str) -> HTTPException:
    return HTTPException(status_code=422, detail=f"Invalid {field_name} filter value")


def coerce_optional_enum[E: Enum](enum_cls: type[E], value: Any, field_name: str) -> E | None:
    if value is None or value == "":
        return None
    if isinstance(value, enum_cls):
        return value
    try:
        return enum_cls(value)
    except (TypeError, ValueError) as exc:
        raise _invalid_filter(field_name) from exc


def coerce_optional_int(
    field_name: str,
    value: Any,
    *,
    min_value: int | None = None,
    max_value: int | None = None,
) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise _invalid_filter(field_name)
    if isinstance(value, int):
        coerced = value
    elif isinstance(value, str):
        raw_value = value.strip()
        if not raw_value or not raw_value.lstrip("-").isdigit():
            raise _invalid_filter(field_name)
        coerced = int(raw_value)
    else:
        raise _invalid_filter(field_name)

    if min_value is not None and coerced < min_value:
        raise _invalid_filter(field_name)
    if max_value is not None and coerced > max_value:
        raise _invalid_filter(field_name)
    return coerced


def coerce_optional_bool(field_name: str, value: Any) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        if value == 0:
            return False
        if value == 1:
            return True
        raise _invalid_filter(field_name)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    raise _invalid_filter(field_name)


def coerce_optional_string(field_name: str, value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise _invalid_filter(field_name)
    return value or None


def coerce_vendor_list_criteria(
    collection_query: CollectionQuery,
    *,
    search: str | None,
    status_filter: VendorStatusEnum | None,
    include_archived: bool,
    vendor_type: VendorTypeEnum | None,
    dora_relevant: bool | None,
    supports_important_core_insurance_function: bool | None,
    is_significant_vendor: bool | None,
    outsourcing_owner_user_id: int | None,
    department_id: int | None,
    process: str | None,
    subprocess: str | None,
    risk_score_1_5: int | None,
    sort_by: str | None,
    sort_order: str | None,
) -> VendorListCriteria:
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
    return VendorListCriteria(
        offset=collection_query.offset,
        limit=collection_query.limit,
        search=coerce_optional_string("search", filter_values.get("search")),
        status_filter=coerce_optional_enum(VendorStatusEnum, filter_values.get("status"), "status"),
        include_archived=coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False,
        vendor_type=coerce_optional_enum(VendorTypeEnum, filter_values.get("vendor_type"), "vendor_type"),
        dora_relevant=coerce_optional_bool("dora_relevant", filter_values.get("dora_relevant")),
        supports_important_core_insurance_function=coerce_optional_bool(
            "supports_important_core_insurance_function",
            filter_values.get("supports_important_core_insurance_function"),
        ),
        is_significant_vendor=coerce_optional_bool("is_significant_vendor", filter_values.get("is_significant_vendor")),
        outsourcing_owner_user_id=coerce_optional_int(
            "outsourcing_owner_user_id", filter_values.get("outsourcing_owner_user_id")
        ),
        department_id=coerce_optional_int("department_id", filter_values.get("department_id")),
        process=coerce_optional_string("process", filter_values.get("process")),
        subprocess=coerce_optional_string("subprocess", filter_values.get("subprocess")),
        risk_score_1_5=coerce_optional_int(
            "risk_score_1_5", filter_values.get("risk_score_1_5"), min_value=1, max_value=5
        ),
        sort_by=collection_query.sort.field if collection_query.sort else sort_by,
        sort_order=collection_query.sort.direction if collection_query.sort else sort_order,
    )


def apply_vendor_list_filters(query: Any, current_user: User, criteria: VendorListCriteria) -> Any:
    query = apply_vendor_visibility_scope(query, current_user, department_id=criteria.department_id)

    if criteria.status_filter is not None:
        query = query.where(Vendor.status == criteria.status_filter.value)
    elif not criteria.include_archived:
        query = query.where(Vendor.status == VendorStatusEnum.active.value)
    if criteria.vendor_type is not None:
        query = query.where(Vendor.vendor_type == criteria.vendor_type.value)
    if criteria.dora_relevant is not None:
        query = query.where(Vendor.dora_relevant == criteria.dora_relevant)
    if criteria.supports_important_core_insurance_function is not None:
        query = query.where(
            Vendor.supports_important_core_insurance_function
            == criteria.supports_important_core_insurance_function
        )
    if criteria.is_significant_vendor is not None:
        query = query.where(Vendor.is_significant_vendor == criteria.is_significant_vendor)
    if criteria.outsourcing_owner_user_id is not None:
        query = query.where(Vendor.outsourcing_owner_user_id == criteria.outsourcing_owner_user_id)
    if criteria.process is not None:
        query = query.where(Vendor.process == criteria.process)
    if criteria.subprocess is not None:
        query = query.where(Vendor.subprocess == criteria.subprocess)
    if criteria.risk_score_1_5 is not None:
        query = query.where(Vendor.risk_score_1_5 == criteria.risk_score_1_5)
    if criteria.search:
        pattern = f"%{criteria.search}%"
        query = query.where(
            or_(
                Vendor.name.ilike(pattern),
                Vendor.legal_name.ilike(pattern),
                Vendor.registration_id.ilike(pattern),
                Vendor.process.ilike(pattern),
            )
        )

    return query


def vendor_order_column(sort_by: str | None) -> Any:
    sort_columns: dict[str, Any] = {
        "name": Vendor.name,
        "status": Vendor.status,
        "vendor_type": Vendor.vendor_type,
        "risk_score_1_5": Vendor.risk_score_1_5,
        "process": Vendor.process,
        "created_at": Vendor.created_at,
    }
    return sort_columns.get(sort_by or "", Vendor.name)


async def list_vendor_governance(
    *,
    db: AsyncSession,
    current_user: User,
    collection_query: CollectionQuery,
    search: str | None,
    status_filter: VendorStatusEnum | None,
    include_archived: bool,
    vendor_type: VendorTypeEnum | None,
    dora_relevant: bool | None,
    supports_important_core_insurance_function: bool | None,
    is_significant_vendor: bool | None,
    outsourcing_owner_user_id: int | None,
    department_id: int | None,
    process: str | None,
    subprocess: str | None,
    risk_score_1_5: int | None,
    sort_by: str | None,
    sort_order: str | None,
    check_permission_fn=check_permission,
    visible_risk_ids_loader=get_visible_vendor_risk_ids,
) -> VendorListResponse:
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

    can_read_risks = check_permission_fn(current_user, "risks", "read")
    collection_capabilities = build_vendor_collection_capabilities(
        current_user,
        check_permission_fn=check_permission_fn,
    )
    base_query = apply_vendor_list_filters(select(Vendor), current_user, criteria)

    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar() or 0
    order_column = vendor_order_column(criteria.sort_by)
    base_query = base_query.order_by(desc(order_column) if criteria.sort_order == "desc" else asc(order_column))

    query_options = (
        selectinload(Vendor.department),
        selectinload(Vendor.outsourcing_owner),
        selectinload(Vendor.risk_links).selectinload(VendorRiskLink.risk),
    )

    filtered_vendor_ids = base_query.with_only_columns(Vendor.id).order_by(None).subquery()
    ordered_query = base_query.options(*query_options)

    async def serialize_vendors(vendors):
        return await serialize_vendor_reads(
            db,
            list(vendors),
            current_user=current_user,
            can_read_risks=can_read_risks,
            visible_risk_ids_loader=visible_risk_ids_loader,
        )

    async def serialize_grouped_vendors(vendors):
        response = await serialize_vendor_list_items(
            db,
            list(vendors),
            current_user=current_user,
            can_read_risks=can_read_risks,
            total=0,
            offset=criteria.offset,
            limit=criteria.limit,
            capabilities=collection_capabilities,
            visible_risk_ids_loader=visible_risk_ids_loader,
        )
        return response.items

    listing_plan = plan_vendor_listing(
        db=db,
        filtered_ids=filtered_vendor_ids,
        current_user=current_user,
        can_read_risks=can_read_risks,
        group_by=collection_query.group_by,
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_vendors,
        serialize_sql_items=serialize_grouped_vendors,
        total=total,
    )

    return await execute_register_listing_plan(
        db=db,
        response_model=VendorListResponse,
        query=collection_query,
        plan=listing_plan,
    )
