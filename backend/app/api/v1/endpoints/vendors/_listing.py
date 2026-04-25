from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.mappers.vendor import vendor_to_read
from app.api.v1.endpoints._collection import (
    CollectionGroupEntry,
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
    merge_collection_filters,
)
from app.core.permissions import can_read_risk_id
from app.models import User, Vendor
from app.schemas.vendor import VendorLinkedRiskSummary, VendorRead, VendorStatusEnum, VendorTypeEnum
from app.services._vendor_workflow import apply_vendor_visibility_scope

VENDOR_GROUP_UNASSIGNED = "__unassigned__"
VENDOR_GROUP_NO_PROCESS = "__no_process__"
VENDOR_GROUP_UNLINKED_RISK = "__unlinked_risk__"
VENDOR_GROUP_DORA_RELEVANT = "__dora_relevant__"
VENDOR_GROUP_SUPPORTS_CORE_FUNCTION = "__supports_core_function__"
VENDOR_GROUP_SIGNIFICANT_VENDOR = "__significant_vendor__"
VENDOR_GROUP_INSIGNIFICANT_VENDOR = "__insignificant_vendor__"


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


def vendor_group_entries(vendor: VendorRead, group_by: str) -> list[CollectionGroupEntry]:
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


async def get_visible_risk_ids(
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


def serialize_vendor_linked_risks(
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


def coerce_vendor_list_criteria(
    collection_query: Any,
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
        is_significant_vendor=coerce_optional_bool(
            "is_significant_vendor", filter_values.get("is_significant_vendor")
        ),
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


async def serialize_vendor_reads(
    db: AsyncSession,
    vendors: list[Vendor],
    *,
    current_user: User,
    can_read_risks: bool,
) -> list[VendorRead]:
    visible_risk_ids = (
        await get_visible_risk_ids(db, current_user=current_user, vendors=vendors) if can_read_risks else set()
    )
    linked_risks_by_vendor_id = serialize_vendor_linked_risks(vendors, visible_risk_ids=visible_risk_ids)
    return [
        vendor_to_read(
            vendor,
            current_user=current_user,
            linked_risks=linked_risks_by_vendor_id.get(vendor.id, []),
        )
        for vendor in vendors
    ]
