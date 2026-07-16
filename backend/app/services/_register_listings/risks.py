from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any, cast

from sqlalchemy import String, and_, asc, case, desc, false, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.risk import risk_summary_load_options, risk_to_summary
from app.core.exceptions import ValidationError
from app.core.permissions import can_read_vendor, risk_visibility_clause
from app.core.security import check_permission
from app.models import (
    ApprovalResourceType,
    ControlRiskLink,
    Department,
    KeyRiskIndicator,
    Risk,
    RiskAssetLink,
    RiskProcessLink,
    User,
    VendorRiskLink,
)
from app.models._archivable import archived_clause
from app.models.global_config import ConfigDefaults, get_config_int
from app.models.key_risk_indicator import kri_breach_condition
from app.schemas.risk import RiskStatusEnum
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._authorization_capabilities.common import pending_approvals_for_resources
from app.services._collection_contracts import CollectionGroupEntry, CollectionQuery, build_grouped_collection_page
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
)
from app.services._ict_register_lifecycle.dq import (
    RISK_BAND_CRITICAL,
    RISK_BAND_HIGH,
    RISK_BAND_LOW,
    RISK_BAND_MEDIUM,
)
from app.services._ict_register_reference.parameters import load_ict_workbook_parameter_set
from app.services.authorization_capabilities import risk_capabilities

from .lifecycle import RegisterListingPlan, SerializeItems, build_register_listing_plan
from .shared import (
    GROUP_UNCATEGORIZED,
    GROUP_UNLINKED_VENDOR,
    build_facet_options,
    parse_prefixed_group_value,
    resolve_register_lifecycle,
    visible_vendor_link_context,
)

RISK_BANDS = (RISK_BAND_LOW, RISK_BAND_MEDIUM, RISK_BAND_HIGH, RISK_BAND_CRITICAL)
RISK_GROUP_UNLINKED_VENDOR = GROUP_UNLINKED_VENDOR
RISK_GROUP_UNCATEGORIZED = GROUP_UNCATEGORIZED
RISK_GROUP_UNKNOWN_DEPARTMENT = "__unknown_department__"
RISK_GROUP_NO_PROCESS = "__no_process__"
RISK_GROUP_UNKNOWN_RISK_TYPE = "__unknown_risk_type__"
RISK_SQL_GROUPS = {"category", "department", "process", "risk_type", "type", "vendor"}


def apply_risk_lifecycle(query, lifecycle: str):
    if lifecycle == "active":
        return query.where(archived_clause(Risk, archived=False))
    if lifecycle == "archived":
        return query.where(archived_clause(Risk, archived=True))
    return query


@dataclass(frozen=True)
class RiskListingCriteria:
    query: CollectionQuery
    filters: dict[str, Any]
    sort_by: str | None = None
    sort_order: str | None = None


def risk_group_entries(risk, group_by: str) -> list[CollectionGroupEntry]:
    if group_by == "vendor":
        vendors = risk.linked_vendors or []
        if not vendors:
            return [CollectionGroupEntry(RISK_GROUP_UNLINKED_VENDOR, RISK_GROUP_UNLINKED_VENDOR)]
        return [CollectionGroupEntry(f"vendor:{vendor.id}", vendor.name) for vendor in vendors]
    if group_by == "category":
        value = risk.category or RISK_GROUP_UNCATEGORIZED
        return [CollectionGroupEntry(value, value)]
    if group_by == "department":
        value = risk.department_name or RISK_GROUP_UNKNOWN_DEPARTMENT
        return [CollectionGroupEntry(value, value)]
    if group_by == "process":
        value = risk.process or RISK_GROUP_NO_PROCESS
        return [CollectionGroupEntry(value, value)]
    if group_by in {"risk_type", "type"}:
        value = risk.risk_type or RISK_GROUP_UNKNOWN_RISK_TYPE
        return [CollectionGroupEntry(value, value)]
    return []


def visible_risk_vendor_context(filtered_ids, current_user: User, *, can_read_vendors: bool):
    return visible_vendor_link_context(
        filtered_ids=filtered_ids,
        current_user=current_user,
        can_read_vendors=can_read_vendors,
        link_model=VendorRiskLink,
        entity_id_column=VendorRiskLink.risk_id,
        entity_id_label="risk_id",
        vendor_id_column=VendorRiskLink.vendor_id,
    )


async def load_risk_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    current_user: User,
    can_read_vendors: bool,
    critical_risk_min_net_score: int,
) -> list[dict[str, Any]]:
    value_expr: Any
    label_expr: Any
    vendor_context = None

    if group_by == "category":
        value_expr = func.coalesce(func.nullif(Risk.category, ""), RISK_GROUP_UNCATEGORIZED)
        label_expr = value_expr
    elif group_by == "department":
        value_expr = func.coalesce(func.nullif(Department.name, ""), RISK_GROUP_UNKNOWN_DEPARTMENT)
        label_expr = value_expr
    elif group_by == "process":
        value_expr = func.coalesce(func.nullif(Risk.process, ""), RISK_GROUP_NO_PROCESS)
        label_expr = value_expr
    elif group_by in {"risk_type", "type"}:
        value_expr = func.coalesce(func.nullif(Risk.risk_type, ""), RISK_GROUP_UNKNOWN_RISK_TYPE)
        label_expr = value_expr
    elif group_by == "vendor" and can_read_vendors:
        vendor_context = visible_risk_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
        value_expr = func.coalesce(
            literal("vendor:") + func.cast(vendor_context.c.vendor_id, String),
            RISK_GROUP_UNLINKED_VENDOR,
        )
        label_expr = func.coalesce(vendor_context.c.vendor_name, RISK_GROUP_UNLINKED_VENDOR)
    elif group_by == "vendor":
        value_expr = literal(RISK_GROUP_UNLINKED_VENDOR)
        label_expr = value_expr
    else:
        return []

    active_expr = and_(Risk.status == RiskStatusEnum.active.value, Risk.live())
    group_query = (
        select(
            value_expr.label("value"),
            label_expr.label("label"),
            func.count(Risk.id).label("count"),
            func.sum(case((active_expr, 1), else_=0)).label("active_count"),
            func.sum(case((Risk.net_score >= critical_risk_min_net_score, 1), else_=0)).label("highlighted_count"),
        )
        .select_from(Risk)
        .join(filtered_ids, Risk.id == filtered_ids.c.id)
    )
    # Each joined group reaches its label table with an explicit ON clause (never an
    # ORM relationship, which cannot resolve against the filtered_ids subquery FROM).
    if group_by == "department":
        group_query = group_query.outerjoin(Department, Department.id == Risk.department_id)
    elif vendor_context is not None:
        group_query = group_query.outerjoin(vendor_context, vendor_context.c.risk_id == Risk.id)
    rows = (await db.execute(group_query.group_by(value_expr, label_expr).order_by(func.lower(label_expr)))).all()
    return [
        {
            "value": row.value,
            "label": row.label,
            "count": row._mapping["count"] or 0,
            "active_count": row.active_count or 0,
            "highlighted_count": row.highlighted_count or 0,
            "meta": {},
        }
        for row in rows
    ]


def risk_group_value_filter(group_by: str, group_value: str, *, vendor_context=None):
    if group_by == "category":
        if group_value == RISK_GROUP_UNCATEGORIZED:
            return or_(Risk.category.is_(None), Risk.category == "")
        return Risk.category == group_value
    if group_by == "department":
        if group_value == RISK_GROUP_UNKNOWN_DEPARTMENT:
            return Risk.department_id.is_(None)
        return Risk.department.has(Department.name == group_value)
    if group_by == "process":
        if group_value == RISK_GROUP_NO_PROCESS:
            return or_(Risk.process.is_(None), Risk.process == "")
        return Risk.process == group_value
    if group_by in {"risk_type", "type"}:
        if group_value == RISK_GROUP_UNKNOWN_RISK_TYPE:
            return or_(Risk.risk_type.is_(None), Risk.risk_type == "")
        return Risk.risk_type == group_value
    if group_by == "vendor" and group_value.startswith("vendor:"):
        vendor_id = parse_prefixed_group_value(group_value, prefix="vendor")
        if vendor_id is None:
            return false()
        if vendor_context is None:
            return false()
        return Risk.id.in_(select(vendor_context.c.risk_id).where(vendor_context.c.vendor_id == vendor_id))
    if group_by == "vendor" and group_value == RISK_GROUP_UNLINKED_VENDOR and vendor_context is not None:
        return ~Risk.id.in_(select(vendor_context.c.risk_id))
    return None


def risk_in_memory_grouped_page(all_items: list[Any], query, *, critical_risk_min_net_score: int):
    return build_grouped_collection_page(
        all_items,
        query,
        get_entries=risk_group_entries,
        is_active=lambda risk: risk.status == RiskStatusEnum.active.value and not risk.is_archived,
        is_highlighted=lambda risk: risk.net_score >= critical_risk_min_net_score,
    )


def _selected_facet_value(value: Any) -> set[str]:
    if value is None or value == "":
        return set()
    if isinstance(value, bool):
        return {"yes" if value else "no"}
    return {str(value)}


async def _build_risk_facets(
    db: AsyncSession,
    *,
    scoped_ids,
    filters: dict[str, Any],
    parameters,
) -> dict[str, list[Any]]:
    """Aggregate facets from the caller's readable Risk universe in bounded SQL."""

    breach_ids = (
        select(KeyRiskIndicator.risk_id.label("risk_id"))
        .where(KeyRiskIndicator.is_archived.is_(False), kri_breach_condition())
        .group_by(KeyRiskIndicator.risk_id)
        .subquery()
    )
    linked_ids = (
        select(RiskProcessLink.risk_id.label("risk_id"))
        .union(
            select(RiskAssetLink.risk_id.label("risk_id")),
            select(VendorRiskLink.risk_id.label("risk_id")),
        )
        .subquery()
    )

    medium_from = cast(int, parameters.value("P_RizStr"))
    high_from = cast(int, parameters.value("P_RizVys"))
    critical_from = cast(int, parameters.value("P_RizKrit"))
    tolerance = cast(int, parameters.value("P_Tolerance"))
    counts: dict[str, Counter[str]] = {
        key: Counter()
        for key in (
            "status",
            "department",
            "risk_type",
            "category",
            "process",
            "is_priority",
            "has_breach",
            "ict_linked",
            "above_tolerance",
            "response",
            "gross_probability",
            "gross_impact",
            "gross_band",
            "net_band",
        )
    }
    catalogs: dict[str, dict[str, tuple[str, dict[str, Any]]]] = {key: {} for key in counts}

    status_value = Risk.status
    response_value = literal("acceptance")

    def yes_no(condition):
        return case((condition, "yes"), else_="no")

    def band_value(score_column):
        return case(
            (score_column >= critical_from, RISK_BAND_CRITICAL),
            (score_column >= high_from, RISK_BAND_HIGH),
            (score_column >= medium_from, RISK_BAND_MEDIUM),
            else_=RISK_BAND_LOW,
        )

    direct_dimensions = {
        "status": status_value,
        "risk_type": Risk.risk_type,
        "category": Risk.category,
        "process": Risk.process,
        "is_priority": yes_no(Risk.is_priority.is_(True)),
        "above_tolerance": yes_no(Risk.net_score > tolerance),
        "gross_probability": func.cast(Risk.gross_probability, String),
        "gross_impact": func.cast(Risk.gross_impact, String),
        "gross_band": band_value(Risk.gross_score),
        "net_band": band_value(Risk.net_score),
    }
    aggregate_queries = []
    for facet_key, value_expr in direct_dimensions.items():
        aggregate_query = (
            select(
                literal(facet_key).label("facet_key"),
                func.cast(value_expr, String).label("value"),
                func.cast(value_expr, String).label("label"),
                func.count(func.distinct(Risk.id)).label("count"),
            )
            .select_from(Risk)
            .join(scoped_ids, scoped_ids.c.id == Risk.id)
            .group_by(value_expr)
        )
        if facet_key in {"risk_type", "category", "process"}:
            aggregate_query = aggregate_query.where(value_expr.is_not(None), value_expr != "")
        aggregate_queries.append(aggregate_query)

    aggregate_queries.append(
        select(
            literal("department").label("facet_key"),
            func.cast(Risk.department_id, String).label("value"),
            func.coalesce(Department.name, "Unknown department").label("label"),
            func.count(func.distinct(Risk.id)).label("count"),
        )
        .select_from(Risk)
        .join(scoped_ids, scoped_ids.c.id == Risk.id)
        .outerjoin(Department, Department.id == Risk.department_id)
        .where(Risk.department_id.is_not(None))
        .group_by(Risk.department_id, Department.name)
    )

    for facet_key, context_ids in (("has_breach", breach_ids), ("ict_linked", linked_ids)):
        value_expr = yes_no(context_ids.c.risk_id.is_not(None))
        aggregate_queries.append(
            select(
                literal(facet_key).label("facet_key"),
                func.cast(value_expr, String).label("value"),
                func.cast(value_expr, String).label("label"),
                func.count(func.distinct(Risk.id)).label("count"),
            )
            .select_from(Risk)
            .join(scoped_ids, scoped_ids.c.id == Risk.id)
            .outerjoin(context_ids, context_ids.c.risk_id == Risk.id)
            .group_by(value_expr)
        )

    response_condition = or_(
        Risk.acceptance_approver.is_not(None),
        Risk.acceptance_justification.is_not(None),
        Risk.acceptance_date.is_not(None),
    )
    aggregate_queries.append(
        select(
            literal("response").label("facet_key"),
            response_value.label("value"),
            response_value.label("label"),
            func.count(func.distinct(Risk.id)).label("count"),
        )
        .select_from(Risk)
        .join(scoped_ids, scoped_ids.c.id == Risk.id)
        .where(response_condition)
    )

    for row in (await db.execute(union_all(*aggregate_queries))).all():
        value = str(row.value)
        counts[row.facet_key][value] = int(row._mapping["count"] or 0)
        catalogs[row.facet_key][value] = (str(row.label), {})

    for key, labels in {
        "status": tuple(value.value for value in RiskStatusEnum),
        "is_priority": ("yes", "no"),
        "has_breach": ("yes", "no"),
        "ict_linked": ("yes", "no"),
        "above_tolerance": ("yes", "no"),
        "response": ("acceptance",),
        "gross_probability": ("1", "2", "3", "4", "5"),
        "gross_impact": ("1", "2", "3", "4", "5"),
        "gross_band": RISK_BANDS,
        "net_band": RISK_BANDS,
    }.items():
        catalogs[key].update({label: (label, {}) for label in labels})

    selected_by_key = {
        "status": _selected_facet_value(filters.get("status")),
        "department": _selected_facet_value(filters.get("department_id")),
        "risk_type": _selected_facet_value(filters.get("risk_type")),
        "category": _selected_facet_value(filters.get("category")),
        "process": _selected_facet_value(filters.get("process")),
        "is_priority": _selected_facet_value(filters.get("is_priority")),
        "has_breach": _selected_facet_value(filters.get("has_breach")),
        "ict_linked": _selected_facet_value(filters.get("ict_linked")),
        "above_tolerance": _selected_facet_value(filters.get("above_tolerance")),
        "response": _selected_facet_value(filters.get("response")),
        "gross_probability": _selected_facet_value(filters.get("gross_probability")),
        "gross_impact": _selected_facet_value(filters.get("gross_impact")),
        "gross_band": _selected_facet_value(filters.get("gross_band")),
        "net_band": _selected_facet_value(filters.get("net_band")),
    }
    return {key: build_facet_options(catalogs[key], counts[key], selected=selected_by_key[key]) for key in counts}


def _plan_risk_listing(
    *,
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    can_read_vendors: bool,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[Risk, Any],
    total: int,
    critical_risk_min_net_score: int,
    facets: dict[str, list[Any]],
) -> RegisterListingPlan[Risk, Any]:
    vendor_context = None

    def get_vendor_context():
        nonlocal vendor_context
        if vendor_context is None:
            vendor_context = visible_risk_vendor_context(filtered_ids, current_user, can_read_vendors=can_read_vendors)
        return vendor_context

    async def load_sql_groups(group_by: str):
        return await load_risk_sql_groups(
            db,
            filtered_ids,
            group_by,
            current_user=current_user,
            can_read_vendors=can_read_vendors,
            critical_risk_min_net_score=critical_risk_min_net_score,
        )

    def build_sql_group_filter(group_by: str, group_value: str | None):
        group_vendor_context = get_vendor_context() if group_by == "vendor" else None
        return risk_group_value_filter(group_by, group_value or "", vendor_context=group_vendor_context)

    return build_register_listing_plan(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        total=total,
        sql_group_keys=RISK_SQL_GROUPS,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        build_in_memory_grouped_page=lambda all_items, query: risk_in_memory_grouped_page(
            all_items,
            query,
            critical_risk_min_net_score=critical_risk_min_net_score,
        ),
        facets=facets,
    )


async def plan_risk_listing(
    *,
    db: AsyncSession,
    current_user: User,
    criteria: RiskListingCriteria,
) -> RegisterListingPlan[Risk, Any]:
    from app.core.permissions import get_risk_ids_where_control_owner, get_risk_ids_where_kri_reporting_owner

    collection_query = criteria.query
    filter_values = criteria.filters
    if collection_query.group_by is not None and collection_query.group_by not in RISK_SQL_GROUPS:
        raise ValidationError("Invalid Risk group_by value")
    if collection_query.group_value is not None and collection_query.group_by is None:
        raise ValidationError("Risk group_value requires group_by")
    department_id = coerce_optional_int("department_id", filter_values.get("department_id"))
    status_value = filter_values.get("status")
    lifecycle, consumed_legacy_archived_status = resolve_register_lifecycle(filter_values)
    status = (
        None
        if consumed_legacy_archived_status
        else coerce_optional_enum(RiskStatusEnum, status_value, "status")
    )
    risk_type = coerce_optional_string("risk_type", filter_values.get("risk_type"))
    is_priority = coerce_optional_bool("is_priority", filter_values.get("is_priority"))
    search = coerce_optional_string("search", filter_values.get("search"))
    has_breach = coerce_optional_bool("has_breach", filter_values.get("has_breach"))
    min_net_score = coerce_optional_int("min_net_score", filter_values.get("min_net_score"), min_value=0, max_value=25)
    process = coerce_optional_string("process", filter_values.get("process"))
    category = coerce_optional_string("category", filter_values.get("category"))
    ict_linked = coerce_optional_bool("ict_linked", filter_values.get("ict_linked"))
    above_tolerance = coerce_optional_bool(
        "above_tolerance", filter_values.get("above_tolerance")
    )
    response = coerce_optional_string("response", filter_values.get("response"))
    gross_probability = coerce_optional_int(
        "gross_probability", filter_values.get("gross_probability"), min_value=1, max_value=5
    )
    gross_impact = coerce_optional_int(
        "gross_impact", filter_values.get("gross_impact"), min_value=1, max_value=5
    )
    gross_band = coerce_optional_string("gross_band", filter_values.get("gross_band"))
    net_band = coerce_optional_string("net_band", filter_values.get("net_band"))
    sort_by = collection_query.sort.field if collection_query.sort else criteria.sort_by
    sort_order = collection_query.sort.direction if collection_query.sort else criteria.sort_order

    base_query = select(Risk)

    visibility_clause = await risk_visibility_clause(db, current_user, department_id=department_id)
    if visibility_clause is not None:
        base_query = base_query.where(visibility_clause)

    base_query = apply_risk_lifecycle(base_query, lifecycle)
    if status:
        base_query = base_query.where(Risk.status == status.value)

    if risk_type:
        base_query = base_query.where(Risk.risk_type == risk_type)

    if is_priority is not None:
        base_query = base_query.where(Risk.is_priority == is_priority)

    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Risk.risk_id_code.ilike(search_pattern),
                Risk.name.ilike(search_pattern),
                Risk.description.ilike(search_pattern),
                Risk.process.ilike(search_pattern),
            )
        )

    if has_breach is not None:
        breaching_subq = (
            select(KeyRiskIndicator.risk_id)
            .where(
                KeyRiskIndicator.is_archived.is_(False),
                kri_breach_condition(),
            )
            .scalar_subquery()
        )

        if has_breach:
            base_query = base_query.where(Risk.id.in_(breaching_subq))
        else:
            base_query = base_query.where(Risk.id.notin_(breaching_subq))

    if min_net_score is not None:
        base_query = base_query.where(Risk.net_score >= min_net_score)

    if process:
        base_query = base_query.where(Risk.process == process)

    if category:
        base_query = base_query.where(Risk.category == category)

    if ict_linked is not None:
        linked_ids = (
            select(RiskProcessLink.risk_id)
            .union(select(RiskAssetLink.risk_id), select(VendorRiskLink.risk_id))
            .scalar_subquery()
        )
        base_query = base_query.where(
            Risk.id.in_(linked_ids) if ict_linked else Risk.id.notin_(linked_ids)
        )

    parameters = await load_ict_workbook_parameter_set(db)
    if above_tolerance is not None:
        tolerance = int(parameters.value("P_Tolerance"))
        base_query = base_query.where(
            Risk.net_score > tolerance if above_tolerance else Risk.net_score <= tolerance
        )

    if response is not None:
        if response != "acceptance":
            raise ValidationError("Invalid response value")
        base_query = base_query.where(
            or_(
                Risk.acceptance_approver.is_not(None),
                Risk.acceptance_justification.is_not(None),
                Risk.acceptance_date.is_not(None),
            )
        )

    if gross_probability is not None:
        base_query = base_query.where(Risk.gross_probability == gross_probability)
    if gross_impact is not None:
        base_query = base_query.where(Risk.gross_impact == gross_impact)

    if gross_band is not None or net_band is not None:
        medium_from = int(parameters.value("P_RizStr"))
        high_from = int(parameters.value("P_RizVys"))
        critical_from = int(parameters.value("P_RizKrit"))

        def band_clause(score_column, band: str):
            if band not in RISK_BANDS:
                raise ValidationError("Invalid risk band value")
            if band == RISK_BANDS[3]:
                return score_column >= critical_from
            if band == RISK_BANDS[2]:
                return and_(score_column >= high_from, score_column < critical_from)
            if band == RISK_BANDS[1]:
                return and_(score_column >= medium_from, score_column < high_from)
            return score_column < medium_from

        if gross_band is not None:
            base_query = base_query.where(band_clause(Risk.gross_score, gross_band))
        if net_band is not None:
            base_query = base_query.where(band_clause(Risk.net_score, net_band))

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    critical_risk_min_net_score = await get_config_int(
        db,
        "critical_risk_min_net_score",
        ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE,
    )
    facet_query = select(Risk.id)
    if visibility_clause is not None:
        facet_query = facet_query.where(visibility_clause)
    facet_query = apply_risk_lifecycle(facet_query, lifecycle)
    facets = await _build_risk_facets(
        db,
        scoped_ids=facet_query.subquery(),
        filters=(
            {**filter_values, "status": None}
            if consumed_legacy_archived_status
            else filter_values
        ),
        parameters=parameters,
    )

    kri_count_column = (
        select(func.count(KeyRiskIndicator.id))
        .where(
            KeyRiskIndicator.risk_id == Risk.id,
            KeyRiskIndicator.is_archived.is_(False),
        )
        .scalar_subquery()
    )
    control_count_column = (
        select(func.count(ControlRiskLink.id)).where(ControlRiskLink.risk_id == Risk.id).scalar_subquery()
    )
    sortable_fields: dict[str, Any] = {
        "name": Risk.name,
        "description": Risk.description,
        "status": Risk.status,
        "risk_id_code": Risk.risk_id_code,
        "category": Risk.category,
        "type": Risk.risk_type,
        "risk_type": Risk.risk_type,
        "gross_score": Risk.gross_score,
        "net_score": Risk.net_score,
        "kri_count": kri_count_column,
        "control_count": control_count_column,
    }
    if sort_by is not None and sort_by not in sortable_fields:
        raise ValidationError("Invalid sort_by value")

    order_column: Any = sortable_fields[sort_by] if sort_by else Risk.risk_id_code

    if sort_order == "desc":
        base_query = base_query.order_by(desc(order_column), desc(Risk.id))
    else:
        base_query = base_query.order_by(asc(order_column), asc(Risk.id))

    query_options = (
        *risk_summary_load_options(),
        selectinload(Risk.vendor_links).selectinload(VendorRiskLink.vendor),
    )

    can_read_vendors = check_permission(current_user, "vendors", "read")
    collection_capabilities = {
        "can_create": check_permission(current_user, "risks", "write"),
        "can_export": check_permission(current_user, "reports", "read"),
        "can_view_vendor_contexts": can_read_vendors,
    }

    async def serialize_risks(risks: list[Risk]):
        risk_ids = {risk.id for risk in risks}
        approvals_by_risk = await pending_approvals_for_resources(
            db,
            resource_type=ApprovalResourceType.RISK,
            resource_ids=risk_ids,
        )
        high_risk_min_net_score = await get_config_int(
            db,
            "high_risk_min_net_score",
            ConfigDefaults.HIGH_RISK_MIN_NET_SCORE,
        )
        kri_reporting_owner_risk_ids = set(await get_risk_ids_where_kri_reporting_owner(db, current_user.id))
        control_owner_risk_ids = set(await get_risk_ids_where_control_owner(db, current_user.id))
        items = []
        for risk in risks:
            linked_vendors: list[LinkedVendorRead] = []
            if can_read_vendors:
                for link in getattr(risk, "vendor_links", []) or []:
                    vendor = getattr(link, "vendor", None)
                    if vendor is None or not can_read_vendor(vendor, current_user):
                        continue
                    linked_vendors.append(
                        LinkedVendorRead(
                            id=vendor.id,
                            name=vendor.name,
                            is_archived=vendor.is_archived,
                        )
                    )
            capabilities = await risk_capabilities(
                db,
                current_user=current_user,
                risk=risk,
                preloaded_approvals=approvals_by_risk.get(risk.id, []),
                high_risk_min_net_score=high_risk_min_net_score,
                can_read_override=True,
                is_kri_reporting_owner_for_risk=risk.id in kri_reporting_owner_risk_ids,
                is_control_owner_for_risk=risk.id in control_owner_risk_ids,
            )
            items.append(risk_to_summary(risk, linked_vendors=linked_vendors, capabilities=capabilities))
        return items

    ordered_query = base_query.options(*query_options)
    filtered_ids = base_query.with_only_columns(Risk.id).order_by(None).subquery()

    return _plan_risk_listing(
        db=db,
        filtered_ids=filtered_ids,
        current_user=current_user,
        can_read_vendors=can_read_vendors,
        ordered_query=ordered_query,
        capabilities=collection_capabilities,
        serialize_items=serialize_risks,
        total=total,
        critical_risk_min_net_score=critical_risk_min_net_score,
        facets=facets,
    )
