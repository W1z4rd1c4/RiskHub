from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any

from sqlalchemy import String, and_, case, false, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.core.exceptions import ValidationError
from app.core.permissions import (
    get_kri_ids_where_reporting_owner,
    get_user_department_ids,
    kri_visibility_clause,
)
from app.core.security import check_permission
from app.models import ApprovalResourceType, Department, KeyRiskIndicator, Risk, User, VendorKRILink
from app.models._archivable import archived_clause
from app.models.global_config import ConfigDefaults, get_config_int
from app.models.key_risk_indicator import KRIFrequency, kri_breach_condition
from app.schemas.collection import CollectionFacetOption, CollectionGroupRead
from app.services._authorization_capabilities.common import pending_approvals_for_resources
from app.services._collection_contracts import CollectionGroupEntry, build_grouped_collection_page
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
)
from app.services._kri_history.direct_application import visible_linked_vendors
from app.services._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.services._monitoring_status import (
    KRIMonitoringStatus,
    KRITimelinessStatus,
    apply_kri_monitoring_status_filter,
    apply_kri_timeliness_status_filter,
    kri_monitoring_status_expression,
)
from app.services.authorization_capabilities import kri_capabilities

from .lifecycle import CollectionQuery, RegisterListingPlan, SerializeItems, build_register_listing_plan
from .shared import (
    GROUP_UNCATEGORIZED,
    GROUP_UNLINKED_VENDOR,
    build_facet_options,
    parse_prefixed_group_value,
    visible_vendor_link_context,
)

KRI_GROUP_UNLINKED_VENDOR = GROUP_UNLINKED_VENDOR
KRI_GROUP_UNCATEGORIZED = GROUP_UNCATEGORIZED
KRI_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
KRI_GROUP_NO_PROCESS = "__no_process__"
KRI_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
KRI_GROUP_UNKNOWN_RISK = "__unknown_risk__"
KRI_SQL_GROUPS = {"category", "department", "process", "risk", "risk_type", "type", "vendor"}
KRI_LIFECYCLES = {"active", "archived", "all"}


@dataclass(frozen=True)
class KRIListingCriteria:
    query: CollectionQuery
    filters: dict[str, Any]


def _selected_facet_value(value: Any) -> set[str]:
    if value is None or value == "":
        return set()
    if isinstance(value, bool):
        return {"yes" if value else "no"}
    return {str(getattr(value, "value", value))}


def resolve_kri_lifecycle(filters: dict[str, Any]) -> str:
    """Resolve lifecycle without overloading the KRI monitoring status."""

    lifecycle = coerce_optional_string("lifecycle", filters.get("lifecycle"))
    if lifecycle is not None:
        if lifecycle not in KRI_LIFECYCLES:
            raise ValidationError("Invalid lifecycle value")
        return lifecycle

    is_archived = coerce_optional_bool("is_archived", filters.get("is_archived"))
    if is_archived is not None:
        return "archived" if is_archived else "active"
    if coerce_optional_bool("include_archived", filters.get("include_archived")):
        return "all"
    return "active"


def kri_effective_active_clause():
    """Canonical live KRI predicate, including the parent Risk lifecycle."""

    return and_(archived_clause(KeyRiskIndicator, archived=False), Risk.live())


def kri_effective_archived_clause():
    """Canonical archived KRI predicate, including non-live parent Risks."""

    return or_(archived_clause(KeyRiskIndicator, archived=True), Risk.archived())


def kri_effective_breach_clause():
    """Canonical live-breach predicate, including the parent Risk lifecycle."""

    return and_(kri_effective_active_clause(), kri_breach_condition())


def effective_kri_lifecycle(kri: KeyRiskIndicator) -> str:
    """Resolve effective lifecycle for already-loaded current-view export rows."""

    risk = getattr(kri, "risk", None)
    risk_status = getattr(getattr(risk, "status", None), "value", getattr(risk, "status", None))
    parent_is_archived = risk is None or bool(getattr(risk, "is_archived", False)) or risk_status == "archived"
    return "archived" if bool(kri.is_archived) or parent_is_archived else "active"


def apply_kri_lifecycle(query, lifecycle: str):
    if lifecycle == "active":
        # Risk archive does not cascade to child KRIs. Active collection views hide
        # children of archived parent Risks, matching the mature list contract.
        return query.where(kri_effective_active_clause())
    if lifecycle == "archived":
        return query.where(kri_effective_archived_clause())
    return query


async def _build_kri_facets(
    db: AsyncSession,
    *,
    readable_ids,
    scoped_ids,
    filters: dict[str, Any],
    today,
    warning_upper_margin_ratio: float,
) -> dict[str, list[CollectionFacetOption]]:
    """Build bounded, permission-scoped facets without hydrating KRI entities."""

    counts: dict[str, Counter[str]] = {
        key: Counter()
        for key in (
            "lifecycle",
            "monitoring_status",
            "timeliness_status",
            "frequency",
            "department",
            "reporting_owner",
            "breach",
        )
    }
    catalogs: dict[str, dict[str, tuple[str, dict[str, Any]]]] = {key: {} for key in counts}

    direct_queries = [
        select(
            literal("lifecycle").label("facet_key"),
            literal("active").label("value"),
            literal("active").label("label"),
            func.count(func.distinct(KeyRiskIndicator.id)).label("count"),
        )
        .select_from(KeyRiskIndicator)
        .join(readable_ids, readable_ids.c.id == KeyRiskIndicator.id)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .where(kri_effective_active_clause()),
        select(
            literal("lifecycle").label("facet_key"),
            literal("archived").label("value"),
            literal("archived").label("label"),
            func.count(func.distinct(KeyRiskIndicator.id)).label("count"),
        )
        .select_from(KeyRiskIndicator)
        .join(readable_ids, readable_ids.c.id == KeyRiskIndicator.id)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .where(kri_effective_archived_clause()),
        select(
            literal("lifecycle").label("facet_key"),
            literal("all").label("value"),
            literal("all").label("label"),
            func.count(func.distinct(KeyRiskIndicator.id)).label("count"),
        )
        .select_from(KeyRiskIndicator)
        .join(readable_ids, readable_ids.c.id == KeyRiskIndicator.id),
        select(
            literal("frequency").label("facet_key"),
            KeyRiskIndicator.frequency.label("value"),
            KeyRiskIndicator.frequency.label("label"),
            func.count(func.distinct(KeyRiskIndicator.id)).label("count"),
        )
        .select_from(KeyRiskIndicator)
        .join(scoped_ids, scoped_ids.c.id == KeyRiskIndicator.id)
        .group_by(KeyRiskIndicator.frequency),
        select(
            literal("department").label("facet_key"),
            func.cast(Risk.department_id, String).label("value"),
            func.coalesce(Department.name, "Unknown department").label("label"),
            func.count(func.distinct(KeyRiskIndicator.id)).label("count"),
        )
        .select_from(KeyRiskIndicator)
        .join(scoped_ids, scoped_ids.c.id == KeyRiskIndicator.id)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .outerjoin(Department, Department.id == Risk.department_id)
        .where(Risk.department_id.is_not(None))
        .group_by(Risk.department_id, Department.name),
        select(
            literal("reporting_owner").label("facet_key"),
            func.cast(KeyRiskIndicator.reporting_owner_id, String).label("value"),
            func.coalesce(User.name, "Unassigned").label("label"),
            func.count(func.distinct(KeyRiskIndicator.id)).label("count"),
        )
        .select_from(KeyRiskIndicator)
        .join(scoped_ids, scoped_ids.c.id == KeyRiskIndicator.id)
        .outerjoin(User, User.id == KeyRiskIndicator.reporting_owner_id)
        .where(KeyRiskIndicator.reporting_owner_id.is_not(None))
        .group_by(KeyRiskIndicator.reporting_owner_id, User.name),
    ]
    breach_value = case((kri_effective_breach_clause(), "yes"), else_="no")
    direct_queries.append(
        select(
            literal("breach").label("facet_key"),
            breach_value.label("value"),
            breach_value.label("label"),
            func.count(func.distinct(KeyRiskIndicator.id)).label("count"),
        )
        .select_from(KeyRiskIndicator)
        .join(scoped_ids, scoped_ids.c.id == KeyRiskIndicator.id)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .group_by(breach_value)
    )

    for row in (await db.execute(union_all(*direct_queries))).all():
        if row.value is None:
            continue
        value = str(row.value)
        counts[row.facet_key][value] = int(row._mapping["count"] or 0)
        catalogs[row.facet_key][value] = (str(row.label), {})

    status_queries = []
    for status in KRIMonitoringStatus:
        status_query = apply_kri_monitoring_status_filter(
            select(KeyRiskIndicator.id)
            .select_from(KeyRiskIndicator)
            .join(scoped_ids, scoped_ids.c.id == KeyRiskIndicator.id),
            monitoring_status=status,
            today=today,
            warning_upper_margin_ratio=warning_upper_margin_ratio,
        )
        status_queries.append(
            select(
                literal("monitoring_status").label("facet_key"),
                literal(status.value).label("value"),
                literal(status.value).label("label"),
                func.count().label("count"),
            ).select_from(status_query.subquery())
        )
    due_soon_query = apply_kri_timeliness_status_filter(
        select(KeyRiskIndicator.id)
        .select_from(KeyRiskIndicator)
        .join(scoped_ids, scoped_ids.c.id == KeyRiskIndicator.id),
        timeliness_status=KRITimelinessStatus.due_soon,
        today=today,
    )
    status_queries.append(
        select(
            literal("timeliness_status").label("facet_key"),
            literal(KRITimelinessStatus.due_soon.value).label("value"),
            literal(KRITimelinessStatus.due_soon.value).label("label"),
            func.count().label("count"),
        ).select_from(due_soon_query.subquery())
    )
    for row in (await db.execute(union_all(*status_queries))).all():
        value = str(row.value)
        counts[row.facet_key][value] = int(row._mapping["count"] or 0)
        catalogs[row.facet_key][value] = (str(row.label), {})

    catalogs["lifecycle"].update({value: (value, {}) for value in ("active", "archived", "all")})
    catalogs["monitoring_status"].update({status.value: (status.value, {}) for status in KRIMonitoringStatus})
    catalogs["timeliness_status"][KRITimelinessStatus.due_soon.value] = (
        KRITimelinessStatus.due_soon.value,
        {},
    )
    catalogs["frequency"].update({frequency.value: (frequency.value, {}) for frequency in KRIFrequency})
    catalogs["breach"].update({value: (value, {}) for value in ("yes", "no")})

    selected = {
        "lifecycle": _selected_facet_value(resolve_kri_lifecycle(filters)),
        "monitoring_status": _selected_facet_value(filters.get("monitoring_status")),
        "timeliness_status": _selected_facet_value(filters.get("timeliness_status")),
        "frequency": _selected_facet_value(filters.get("frequency")),
        "department": _selected_facet_value(filters.get("department_id")),
        "reporting_owner": _selected_facet_value(filters.get("reporting_owner_id")),
        "breach": {"yes"} if filters.get("breach_only") is True else set(),
    }
    return {
        key: build_facet_options(catalogs[key], counts[key], selected=selected[key])
        for key in counts
    }


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
    return visible_vendor_link_context(
        filtered_ids=filtered_ids,
        current_user=current_user,
        can_read_vendors=can_read_vendors,
        link_model=VendorKRILink,
        entity_id_column=VendorKRILink.kri_id,
        entity_id_label="kri_id",
        vendor_id_column=VendorKRILink.vendor_id,
    )


async def load_kri_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    current_user: User,
    can_read_vendors: bool,
) -> list[CollectionGroupRead]:
    breach_expr = kri_effective_breach_clause()
    active_expr = kri_effective_active_clause()

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
        vendor_id = parse_prefixed_group_value(group_value, prefix="vendor")
        if vendor_id is None:
            return false()
        if vendor_context is None:
            return false()
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
    facets: dict[str, list[CollectionFacetOption]],
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

    return build_register_listing_plan(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        total=total,
        sql_group_keys=KRI_SQL_GROUPS,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        sql_group_query_transform=lambda query: query.outerjoin(Department, Department.id == Risk.department_id),
        build_in_memory_grouped_page=kri_in_memory_grouped_page,
        facets=facets,
    )


async def build_kri_listing_plan(
    *,
    db: AsyncSession,
    current_user: User,
    criteria: KRIListingCriteria,
) -> RegisterListingPlan[KeyRiskIndicator, Any]:
    filter_values = criteria.filters
    if criteria.query.group_by is not None and criteria.query.group_by not in KRI_SQL_GROUPS:
        raise ValidationError("Invalid KRI group_by value")
    if criteria.query.group_value is not None and criteria.query.group_by is None:
        raise ValidationError("KRI group_value requires group_by")
    risk_id = coerce_optional_int("risk_id", filter_values.get("risk_id"))
    department_id = coerce_optional_int("department_id", filter_values.get("department_id"))
    reporting_owner_id = coerce_optional_int(
        "reporting_owner_id",
        filter_values.get("reporting_owner_id"),
    )
    frequency = coerce_optional_enum(KRIFrequency, filter_values.get("frequency"), "frequency")
    search = coerce_optional_string("search", filter_values.get("search"))
    breach_only = coerce_optional_bool("breach_only", filter_values.get("breach_only")) or False
    lifecycle = resolve_kri_lifecycle(filter_values)
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

    readable_query = select(KeyRiskIndicator).join(Risk)

    visibility_clause = await kri_visibility_clause(db, current_user)
    if visibility_clause is not None:
        readable_query = readable_query.where(visibility_clause)

    query = apply_kri_lifecycle(readable_query, lifecycle)

    if risk_id:
        query = query.where(KeyRiskIndicator.risk_id == risk_id)

    if department_id is not None:
        query = query.where(Risk.department_id == department_id)

    if reporting_owner_id is not None:
        query = query.where(KeyRiskIndicator.reporting_owner_id == reporting_owner_id)

    if frequency is not None:
        query = query.where(KeyRiskIndicator.frequency == frequency.value)

    if search:
        search_term = f"%{search.strip().lower()}%"
        query = query.where(func.lower(KeyRiskIndicator.metric_name).like(search_term))

    if breach_only:
        query = query.where(kri_effective_breach_clause())

    query = query.options(
        selectinload(KeyRiskIndicator.reporting_owner),
        selectinload(KeyRiskIndicator.risk).options(selectinload(Risk.owner), selectinload(Risk.department)),
        selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
    )
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())

    readable_ids = readable_query.with_only_columns(KeyRiskIndicator.id).order_by(None).subquery()
    facet_scope_query = apply_kri_lifecycle(readable_query, lifecycle)
    if department_id is not None:
        facet_scope_query = facet_scope_query.where(Risk.department_id == department_id)
    scoped_ids = facet_scope_query.with_only_columns(KeyRiskIndicator.id).order_by(None).subquery()
    facets = await _build_kri_facets(
        db,
        readable_ids=readable_ids,
        scoped_ids=scoped_ids,
        filters={**filter_values, "breach_only": breach_only},
        today=now.date(),
        warning_upper_margin_ratio=monitoring_context.kri_config.warning_upper_margin_ratio,
    )

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
    sortable_fields = {
        "metric_name": KeyRiskIndicator.metric_name,
        "current_value": KeyRiskIndicator.current_value,
        "monitoring_status": kri_monitoring_status_expression(
            today=now.date(),
            warning_upper_margin_ratio=monitoring_context.kri_config.warning_upper_margin_ratio,
        ),
        "risk_process": Risk.process,
        "risk_description": Risk.description,
    }
    requested_sort = criteria.query.sort
    if requested_sort is not None and requested_sort.field not in sortable_fields:
        raise ValidationError("Invalid sort_by value")

    if requested_sort is None:
        ordered_query = filtered_query.order_by(KeyRiskIndicator.metric_name, KeyRiskIndicator.id)
    else:
        sort_expression = sortable_fields[requested_sort.field]
        ordered_expression = (
            sort_expression.asc() if requested_sort.direction == "asc" else sort_expression.desc()
        ).nullslast()
        ordered_query = filtered_query.order_by(ordered_expression, KeyRiskIndicator.id)

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
        facets=facets,
    )
