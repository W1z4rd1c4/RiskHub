from __future__ import annotations

from collections.abc import Awaitable, Callable, Collection, Sequence
from dataclasses import dataclass, field
from typing import Any

from app.services._collection_contracts import (
    BuildInMemoryGroupedPage,
    BuildSqlGroupFilter,
    CollectionQuery,
    CollectionListingDefinition,
    LoadSqlGroups,
    LoadTotal,
    QueryTransform,
    execute_collection_listing_with_definition,
)

SerializeItems = Callable[[Sequence[Any]], Awaitable[list[Any]]]
RegisterListingDefinition = CollectionListingDefinition


@dataclass(frozen=True)
class RegisterListingCriteria:
    query: CollectionQuery


@dataclass(frozen=True)
class RegisterSerializerContext:
    current_actor: Any
    pending_approvals: Any = None
    monitoring_context: Any = None
    vendor_visibility: Any = None
    capability_preload_data: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RegisterListingPlan:
    ordered_query: Any
    listing_definition: RegisterListingDefinition


def _plan_register_listing(
    *,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems,
    serialize_sql_items: SerializeItems | None = None,
    total: int | None = None,
    load_total: LoadTotal | None = None,
    sql_group_keys: Collection[str] = frozenset(),
    load_sql_groups: LoadSqlGroups | None = None,
    build_sql_group_filter: BuildSqlGroupFilter | None = None,
    sql_group_query_transform: QueryTransform | None = None,
    build_in_memory_grouped_page: BuildInMemoryGroupedPage[Any] | None = None,
) -> RegisterListingPlan:
    return RegisterListingPlan(
        ordered_query=ordered_query,
        listing_definition=RegisterListingDefinition(
            capabilities=capabilities,
            serialize_items=serialize_items,
            serialize_sql_items=serialize_sql_items,
            total=total,
            load_total=load_total,
            sql_group_keys=sql_group_keys,
            load_sql_groups=load_sql_groups,
            build_sql_group_filter=build_sql_group_filter,
            sql_group_query_transform=sql_group_query_transform,
            build_in_memory_grouped_page=build_in_memory_grouped_page,
        ),
    )


def plan_risk_listing(**kwargs: Any) -> RegisterListingPlan:
    return _plan_register_listing(**kwargs)


def plan_control_listing(**kwargs: Any) -> RegisterListingPlan:
    return _plan_register_listing(**kwargs)


def plan_kri_listing(**kwargs: Any) -> RegisterListingPlan:
    return _plan_register_listing(**kwargs)


def plan_issue_listing(**kwargs: Any) -> RegisterListingPlan:
    return _plan_register_listing(**kwargs)


def plan_vendor_listing(**kwargs: Any) -> RegisterListingPlan:
    return _plan_register_listing(**kwargs)


async def execute_register_listing_plan(
    *,
    db: Any,
    response_model: type[Any],
    query: CollectionQuery,
    plan: RegisterListingPlan,
) -> Any:
    return await execute_collection_listing_with_definition(
        db=db,
        response_model=response_model,
        query=query,
        ordered_query=plan.ordered_query,
        definition=plan.listing_definition,
    )
