from __future__ import annotations

from typing import Any

from sqlalchemy import String, case, false, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import risk_visibility_clause
from app.models import Department, Risk, User, Vendor, VendorRiskLink
from app.schemas.collection import CollectionGroupRead
from app.schemas.vendor import VendorStatusEnum

from .lifecycle import RegisterListingPlan, SerializeItems, _plan_register_listing

VENDOR_GROUP_UNASSIGNED = "__unassigned__"
VENDOR_GROUP_NO_PROCESS = "__no_process__"
VENDOR_GROUP_UNLINKED_RISK = "__unlinked_risk__"
VENDOR_GROUP_DORA_RELEVANT = "__dora_relevant__"
VENDOR_GROUP_SUPPORTS_CORE_FUNCTION = "__supports_core_function__"
VENDOR_GROUP_SIGNIFICANT_VENDOR = "__significant_vendor__"
VENDOR_GROUP_INSIGNIFICANT_VENDOR = "__insignificant_vendor__"


def vendor_group_counts() -> tuple:
    return (
        func.count(func.distinct(Vendor.id)).label("count"),
        func.count(
            func.distinct(case((Vendor.status == VendorStatusEnum.active.value, Vendor.id), else_=None))
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


async def load_vendor_sql_groups(
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
    serialize_items: SerializeItems[Any, Any],
    serialize_sql_items: SerializeItems[Any, Any],
    total: int,
) -> RegisterListingPlan:
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
