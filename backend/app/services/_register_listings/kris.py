from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import String, case, false, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.core.exceptions import ValidationError
from app.core.permissions import (
    get_kri_ids_where_reporting_owner,
    get_user_department_ids,
    kri_visibility_clause,
    vendor_visibility_clause,
)
from app.core.security import check_permission
from app.models import ApprovalResourceType, Department, KeyRiskIndicator, Risk, User, Vendor, VendorKRILink
from app.models._archivable import archived_clause
from app.models.global_config import ConfigDefaults, get_config_int
from app.schemas.collection import CollectionGroupRead
from app.services._authorization_capabilities.common import pending_approvals_for_resources
from app.services._collection_contracts import CollectionGroupEntry, build_grouped_collection_page
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
)
from app.services._kri_history.value_application import visible_linked_vendors
from app.services._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.services._monitoring_status import (
    KRIMonitoringStatus,
    KRITimelinessStatus,
    apply_kri_monitoring_status_filter,
    apply_kri_timeliness_status_filter,
)
from app.services.authorization_capabilities import kri_capabilities

from .lifecycle import CollectionQuery, RegisterListingPlan, SerializeItems, _plan_register_listing

KRI_GROUP_UNLINKED_VENDOR = "__unlinked_vendor__"
KRI_GROUP_UNCATEGORIZED = "__uncategorized__"
KRI_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
KRI_GROUP_NO_PROCESS = "__no_process__"
KRI_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
KRI_GROUP_UNKNOWN_RISK = "__unknown_risk__"
KRI_SQL_GROUPS = {"category", "department", "process", "risk", "risk_type", "type", "vendor"}


@dataclass(frozen=True)
class KRIListingCriteria:
    query: CollectionQuery
    filters: dict[str, Any]


async def can_create_kri_for_any_parent_risk(db: AsyncSession, current_user: User) -> bool:
    if not check_permission(current_user, "risks", "write"):
        return False

    query = select(Risk.id).where(Risk.live()).limit(1)
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        if not dept_ids:
            return False
        query = query.where(Risk.department_id.in_(dept_ids))

    return (await db.scalar(query)) is not None


def kri_group_entries(kri, group_by: str) -> list[CollectionGroupEntry]:
    if group_by == "vendor":
        vendors = getattr(kri, "linked_vendors", None) or []
        if not vendors:
            return [CollectionGroupEntry(KRI_GROUP_UNLINKED_VENDOR, KRI_GROUP_UNLINKED_VENDOR)]
        return [CollectionGroupEntry(f"vendor:{vendor.id}", vendor.name) for vendor in vendors]
    if group_by == "category":
        value = kri.risk_category or KRI_GROUP_UNCATEGORIZED
        return [CollectionGroupEntry(value, value)]
    if group_by == "department":
        value = kri.department_name or KRI_GROUP_UNKNOWN_DEPARTMENT
        return [CollectionGroupEntry(value, value)]
    if group_by == "process":
        value = kri.risk_process or KRI_GROUP_NO_PROCESS
        return [CollectionGroupEntry(value, value)]
    if group_by in {"type", "risk_type"}:
        value = kri.risk_type or KRI_GROUP_UNKNOWN_RISK_TYPE
        return [CollectionGroupEntry(value, value)]
    if group_by == "risk":
        value = kri.risk_name or KRI_GROUP_UNKNOWN_RISK
        return [
            CollectionGroupEntry(
                value,
                value,
                {
                    "risk_type": kri.risk_type or "",
                    "risk_department_name": kri.risk_department_name or "",
                    "risk_owner_name": kri.risk_owner_name or "",
                },
            )
        ]
    return []


def count_distinct_kri_if(condition):
    return func.count(func.distinct(case((condition, KeyRiskIndicator.id))))


def visible_kri_vendor_context(filtered_ids, current_user: User, *, can_read_vendors: bool):
    query = (
        select(
            VendorKRILink.kri_id.label("kri_id"),
            Vendor.id.label("vendor_id"),
            Vendor.name.label("vendor_name"),
        )
        .select_from(VendorKRILink)
        .join(filtered_ids, filtered_ids.c.id == VendorKRILink.kri_id)
        .join(Vendor, Vendor.id == VendorKRILink.vendor_id)
    )
    vendor_visibility = vendor_visibility_clause(current_user) if can_read_vendors else false()
    if vendor_visibility is not None:
        query = query.where(vendor_visibility)
    return query.subquery()


async def load_kri_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    current_user: User,
    can_read_vendors: bool,
) -> list[CollectionGroupRead]:
    breach_expr = or_(
        KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
        KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
    )
    active_expr = KeyRiskIndicator.is_archived.is_(False)

    if group_by == "category":
        value_expr = func.coalesce(Risk.category, KRI_GROUP_UNCATEGORIZED)
        label_expr = value_expr
        meta_expr = None
    elif group_by == "department":
        value_expr = func.coalesce(Department.name, KRI_GROUP_UNKNOWN_DEPARTMENT)
        label_expr = value_expr
        meta_expr = None
    elif group_by == "process":
        value_expr = func.coalesce(Risk.process, KRI_GROUP_NO_PROCESS)
        label_expr = value_expr
        meta_expr = None
    elif group_by in {"risk_type", "type"}:
        value_expr = func.coalesce(Risk.risk_type, KRI_GROUP_UNKNOWN_RISK_TYPE)
        label_expr = value_expr
        meta_expr = None
    elif group_by == "risk":
        value_expr = func.coalesce(Risk.name, KRI_GROUP_UNKNOWN_RISK)
        label_expr = value_expr
        meta_expr = {
            "risk_type": func.coalesce(Risk.risk_type, ""),
            "risk_department_name": func.coalesce(Department.name, ""),
            "risk_owner_name": literal(""),
        }
    elif group_by == "vendor":
        vendor_context = visible_kri_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
        value_expr = func.coalesce(
            literal("vendor:") + func.cast(vendor_context.c.vendor_id, String),
            KRI_GROUP_UNLINKED_VENDOR,
        )
        label_expr = func.coalesce(vendor_context.c.vendor_name, KRI_GROUP_UNLINKED_VENDOR)
        meta_expr = None
    else:
        return []

    selected_columns = [
        value_expr.label("value"),
        label_expr.label("label"),
        func.count(func.distinct(KeyRiskIndicator.id)).label("count"),
        count_distinct_kri_if(active_expr).label("active_count"),
        count_distinct_kri_if(breach_expr).label("highlighted_count"),
    ]
    if isinstance(meta_expr, dict):
        selected_columns.extend(expr.label(key) for key, expr in meta_expr.items())

    query = (
        select(*selected_columns)
        .select_from(KeyRiskIndicator)
        .join(filtered_ids, filtered_ids.c.id == KeyRiskIndicator.id)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
    )
    if group_by in {"department", "risk"}:
        query = query.outerjoin(Department, Department.id == Risk.department_id)
    if group_by == "vendor":
        query = query.outerjoin(vendor_context, vendor_context.c.kri_id == KeyRiskIndicator.id)

    group_columns: list[Any] = [value_expr, label_expr]
    if isinstance(meta_expr, dict):
        group_columns.extend(meta_expr.values())

    groups = []
    for row in (await db.execute(query.group_by(*group_columns).order_by(func.lower(label_expr)))).all():
        meta = {key: getattr(row, key, "") for key in meta_expr} if isinstance(meta_expr, dict) else {}
        groups.append(
            CollectionGroupRead(
                value=str(row.value),
                label=str(row.label),
                count=row._mapping["count"],
                active_count=row.active_count,
                highlighted_count=row.highlighted_count,
                meta=meta,
            )
        )
    return groups


def kri_group_filter(group_by: str, group_value: str, *, vendor_context=None):
    if group_by == "category":
        return func.coalesce(Risk.category, KRI_GROUP_UNCATEGORIZED) == group_value
    if group_by == "department":
        return func.coalesce(Department.name, KRI_GROUP_UNKNOWN_DEPARTMENT) == group_value
    if group_by == "process":
        return func.coalesce(Risk.process, KRI_GROUP_NO_PROCESS) == group_value
    if group_by in {"risk_type", "type"}:
        return func.coalesce(Risk.risk_type, KRI_GROUP_UNKNOWN_RISK_TYPE) == group_value
    if group_by == "risk":
        return func.coalesce(Risk.name, KRI_GROUP_UNKNOWN_RISK) == group_value
    if group_by == "vendor" and group_value.startswith("vendor:"):
        try:
            vendor_id = int(group_value.removeprefix("vendor:"))
        except ValueError:
            return KeyRiskIndicator.id.is_(None)
        if vendor_context is None:
            return KeyRiskIndicator.id.is_(None)
        return KeyRiskIndicator.id.in_(select(vendor_context.c.kri_id).where(vendor_context.c.vendor_id == vendor_id))
    if group_by == "vendor" and group_value == KRI_GROUP_UNLINKED_VENDOR and vendor_context is not None:
        return ~KeyRiskIndicator.id.in_(select(vendor_context.c.kri_id))
    return None


def kri_in_memory_grouped_page(all_items, query):
    return build_grouped_collection_page(
        all_items,
        query,
        get_entries=kri_group_entries,
        is_highlighted=lambda item: getattr(item, "monitoring_status", None) == "breach",
    )


def plan_kri_listing(
    *,
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    can_read_vendors: bool,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[KeyRiskIndicator, Any],
    total: int,
) -> RegisterListingPlan[KeyRiskIndicator, Any]:
    async def load_sql_groups(group_by: str):
        return await load_kri_sql_groups(
            db,
            filtered_ids,
            group_by,
            current_user=current_user,
            can_read_vendors=can_read_vendors,
        )

    def build_sql_group_filter(group_by: str, group_value: str | None):
        vendor_context = (
            visible_kri_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
            if group_by == "vendor"
            else None
        )
        return kri_group_filter(group_by, group_value or "", vendor_context=vendor_context)

    return _plan_register_listing(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        total=total,
        sql_group_keys=KRI_SQL_GROUPS,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        sql_group_query_transform=lambda query: query.outerjoin(Department, Department.id == Risk.department_id),
        build_in_memory_grouped_page=kri_in_memory_grouped_page,
    )


async def build_kri_listing_plan(
    *,
    db: AsyncSession,
    current_user: User,
    criteria: KRIListingCriteria,
) -> RegisterListingPlan[KeyRiskIndicator, Any]:
    filter_values = criteria.filters
    risk_id = coerce_optional_int("risk_id", filter_values.get("risk_id"))
    search = coerce_optional_string("search", filter_values.get("search"))
    breach_only = coerce_optional_bool("breach_only", filter_values.get("breach_only")) or False
    include_archived = coerce_optional_bool("include_archived", filter_values.get("include_archived")) or False
    is_archived = coerce_optional_bool("is_archived", filter_values.get("is_archived"))
    monitoring_status = coerce_optional_enum(
        KRIMonitoringStatus,
        filter_values.get("monitoring_status"),
        "monitoring_status",
    )
    timeliness_status = coerce_optional_enum(
        KRITimelinessStatus,
        filter_values.get("timeliness_status"),
        "timeliness_status",
    )

    if monitoring_status is not None and timeliness_status is not None:
        raise ValidationError("monitoring_status and timeliness_status cannot be used together", status_code=422)

    query = select(KeyRiskIndicator).join(Risk)

    if is_archived is not None:
        query = query.where(archived_clause(KeyRiskIndicator, archived=is_archived))
    elif not include_archived:
        query = query.where(archived_clause(KeyRiskIndicator, archived=False))

    visibility_clause = await kri_visibility_clause(db, current_user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)

    if risk_id:
        query = query.where(KeyRiskIndicator.risk_id == risk_id)

    if search:
        search_term = f"%{search.strip().lower()}%"
        query = query.where(func.lower(KeyRiskIndicator.metric_name).like(search_term))

    if breach_only:
        query = query.where(
            or_(
                KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
            )
        )

    query = query.options(
        selectinload(KeyRiskIndicator.reporting_owner),
        selectinload(KeyRiskIndicator.risk).options(selectinload(Risk.owner), selectinload(Risk.department)),
        selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())

    filtered_query = query
    if monitoring_status is not None:
        filtered_query = apply_kri_monitoring_status_filter(
            filtered_query,
            monitoring_status=monitoring_status,
            today=now.date(),
            warning_upper_margin_ratio=monitoring_context.kri_config.warning_upper_margin_ratio,
        )
    elif timeliness_status is not None:
        filtered_query = apply_kri_timeliness_status_filter(
            filtered_query,
            timeliness_status=timeliness_status,
            today=now.date(),
        )

    can_read_vendors = check_permission(current_user, "vendors", "read")
    collection_capabilities = {
        "can_create": await can_create_kri_for_any_parent_risk(db, current_user),
        "can_export": check_permission(current_user, "reports", "read"),
        "can_view_vendor_contexts": can_read_vendors,
    }
    ordered_query = filtered_query.order_by(KeyRiskIndicator.metric_name)

    async def serialize_kris(kris: list[KeyRiskIndicator]):
        kri_ids = {kri.id for kri in kris}
        approvals_by_kri = await pending_approvals_for_resources(
            db,
            resource_type=ApprovalResourceType.KRI,
            resource_ids=kri_ids,
        )
        high_risk_min_net_score = await get_config_int(
            db,
            "high_risk_min_net_score",
            ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
        )
        reporting_owner_kri_ids = set(await get_kri_ids_where_reporting_owner(db, current_user.id))
        items = []
        for kri in kris:
            capabilities = await kri_capabilities(
                db,
                current_user=current_user,
                kri=kri,
                preloaded_approvals=approvals_by_kri.get(kri.id, []),
                high_risk_min_net_score=high_risk_min_net_score,
                can_read_override=True,
                is_reporting_owner_override=kri.id in reporting_owner_kri_ids,
            )
            items.append(
                serialize_kri_response(
                    kri,
                    monitoring_context,
                    linked_vendors=visible_linked_vendors(current_user, getattr(kri, "vendor_links", [])),
                    capabilities=capabilities,
                )
            )
        return items

    total = (await db.execute(select(func.count()).select_from(filtered_query.subquery()))).scalar() or 0
    filtered_ids = filtered_query.with_only_columns(KeyRiskIndicator.id).order_by(None).subquery()

    return plan_kri_listing(
        db=db,
        filtered_ids=filtered_ids,
        current_user=current_user,
        can_read_vendors=can_read_vendors,
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_kris,
        total=total,
    )
