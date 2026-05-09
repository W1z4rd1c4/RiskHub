from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import String, asc, case, desc, false, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import risk_visibility_clause
from app.core.security import check_permission
from app.models import Department, Risk, User, Vendor, VendorRiskLink
from app.models._archivable import archived_clause
from app.schemas.collection import CollectionGroupRead
from app.schemas.vendor import VendorListResponse, VendorTypeEnum
from app.services._collection_contracts import CollectionQuery
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
)
from app.services._vendor_governance.projection import (
    get_visible_vendor_risk_ids,
    serialize_vendor_list_items,
    serialize_vendor_reads,
)
from app.services._vendor_workflow import apply_vendor_visibility_scope

from .lifecycle import RegisterListingPlan, SerializeItems, _plan_register_listing, execute_register_listing_plan

VENDOR_GROUP_UNASSIGNED = "__unassigned__"
VENDOR_GROUP_NO_PROCESS = "__no_process__"
VENDOR_GROUP_UNLINKED_RISK = "__unlinked_risk__"
VENDOR_GROUP_DORA_RELEVANT = "__dora_relevant__"
VENDOR_GROUP_SUPPORTS_CORE_FUNCTION = "__supports_core_function__"
VENDOR_GROUP_SIGNIFICANT_VENDOR = "__significant_vendor__"
VENDOR_GROUP_INSIGNIFICANT_VENDOR = "__insignificant_vendor__"


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


def build_vendor_collection_capabilities(
    current_user: User,
    *,
    check_permission_fn=check_permission,
) -> dict[str, bool]:
    return {
        "can_create": check_permission_fn(current_user, "vendors", "write"),
        "can_export": check_permission_fn(current_user, "reports", "read"),
        "can_view_risk_contexts": check_permission_fn(current_user, "risks", "read"),
    }


def merge_collection_filters(query: CollectionQuery, defaults: dict[str, Any]) -> dict[str, Any]:
    return defaults | query.filters


def coerce_vendor_list_criteria(
    collection_query: CollectionQuery,
    *,
    search: str | None,
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

    if not criteria.include_archived:
        query = query.where(archived_clause(Vendor, archived=False))
    if criteria.vendor_type is not None:
        query = query.where(Vendor.vendor_type == criteria.vendor_type.value)
    if criteria.dora_relevant is not None:
        query = query.where(Vendor.dora_relevant == criteria.dora_relevant)
    if criteria.supports_important_core_insurance_function is not None:
        query = query.where(
            Vendor.supports_important_core_insurance_function == criteria.supports_important_core_insurance_function
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
        "vendor_type": Vendor.vendor_type,
        "risk_score_1_5": Vendor.risk_score_1_5,
        "process": Vendor.process,
        "created_at": Vendor.created_at,
    }
    return sort_columns.get(sort_by or "", Vendor.name)


def vendor_group_counts() -> tuple:
    return (
        func.count(func.distinct(Vendor.id)).label("count"),
        func.count(
            func.distinct(
                case(
                    (
                        archived_clause(Vendor, archived=False),
                        Vendor.id,
                    ),
                    else_=None,
                )
            )
        ).label("active_count"),
        func.count(func.distinct(case((Vendor.risk_score_1_5 >= 4, Vendor.id), else_=None))).label(
            "highlighted_count"
        ),
    )


def vendor_group_rows_to_reads(rows) -> list[CollectionGroupRead]:
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


async def visible_vendor_risk_context(
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


def vendor_flag_membership_query(filtered_ids):
    def flag_select(value: str, condition):
        return (
            select(
                literal(value).label("value"),
                literal(value).label("label"),
                Vendor.id.label("vendor_id"),
                Vendor.is_archived.label("is_archived"),
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


async def load_vendor_sql_groups(
    db: AsyncSession,
    filtered_ids,
    group_by: str,
    *,
    current_user: User,
    can_read_risks: bool,
) -> list[CollectionGroupRead]:
    query = select(Vendor).join(filtered_ids, filtered_ids.c.id == Vendor.id)
    value_expr: Any
    label_expr: Any

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
        risk_context = await visible_vendor_risk_context(
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
        flag_rows = vendor_flag_membership_query(filtered_ids)
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
                                    (
                                        flag_rows.c.is_archived.is_(False),
                                        flag_rows.c.vendor_id,
                                    ),
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
        return vendor_group_rows_to_reads(rows)
    else:
        return []

    rows = (
        (
            await db.execute(
                query.with_only_columns(
                    value_expr.label("value"),
                    label_expr.label("label"),
                    *vendor_group_counts(),
                )
                .group_by(value_expr, label_expr)
                .order_by(label_expr)
            )
        )
        .mappings()
        .all()
    )
    return vendor_group_rows_to_reads(rows)


def vendor_group_value_filter(group_by: str, group_value: str, *, risk_context=None):
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


def plan_vendor_listing(
    *,
    db: AsyncSession,
    filtered_ids,
    current_user: User,
    can_read_risks: bool,
    group_by: str | None,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[Vendor, Any],
    serialize_sql_items: SerializeItems[Vendor, Any],
    total: int,
) -> RegisterListingPlan[Vendor, Any]:
    async def load_sql_groups(group_by: str):
        return await load_vendor_sql_groups(
            db,
            filtered_ids,
            group_by,
            current_user=current_user,
            can_read_risks=can_read_risks,
        )

    async def build_sql_group_filter(group_by: str, group_value: str | None):
        risk_context = (
            await visible_vendor_risk_context(
                db,
                filtered_ids,
                current_user,
                can_read_risks=can_read_risks,
            )
            if group_by == "risk"
            else None
        )
        return vendor_group_value_filter(group_by, group_value or "", risk_context=risk_context)

    return _plan_register_listing(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        serialize_sql_items=serialize_sql_items,
        total=total,
        sql_group_keys={group_by} if group_by else frozenset(),
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
    )


async def list_vendor_governance(
    *,
    db: AsyncSession,
    current_user: User,
    collection_query: CollectionQuery,
    search: str | None,
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
