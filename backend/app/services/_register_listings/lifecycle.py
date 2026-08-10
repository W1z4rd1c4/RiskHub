from __future__ import annotations

from collections.abc import Awaitable, Callable, Collection
from dataclasses import dataclass
from typing import Any, Generic, Protocol, TypeVar

from app.services._collection_contracts import (
    BuildInMemoryGroupedPage,
    BuildSqlGroupFilter,
    CollectionListingDefinition,
    CollectionQuery,
    LoadSqlGroups,
    LoadTotal,
    QueryTransform,
    execute_collection_export_with_definition,
    execute_collection_listing_with_definition,
    load_collection_export_models_with_definition,
)

TModel = TypeVar("TModel")
TItem = TypeVar("TItem")

SerializeItems = Callable[[list[TModel]], Awaitable[list[TItem]]]


class InMemoryRegisterCriteria(Protocol):
    """Pagination and grouping state shared by derived in-memory registers.

    Members are read-only properties so frozen dataclass criteria satisfy the
    protocol structurally without claiming settable attributes.
    """

    @property
    def offset(self) -> int: ...

    @property
    def limit(self) -> int: ...

    @property
    def group_by(self) -> str | None: ...

    @property
    def group_value(self) -> str | None: ...


class InMemoryRegisterResult(Protocol[TItem]):
    """Canonical result shape produced from one permission-scoped candidate set.

    Members are read-only properties so frozen dataclass results satisfy the
    protocol structurally without claiming settable attributes.
    """

    @property
    def matching_items(self) -> list[TItem]: ...

    @property
    def page_items(self) -> list[TItem]: ...

    @property
    def groups(self) -> list[Any]: ...

    @property
    def facets(self) -> dict[str, Any]: ...


@dataclass(frozen=True)
class RegisterListingPlan(Generic[TModel, TItem]):
    ordered_query: Any
    listing_definition: CollectionListingDefinition[TModel, TItem]


def build_in_memory_register_response(
    *,
    response_model: type[Any],
    criteria: InMemoryRegisterCriteria,
    result: InMemoryRegisterResult[TItem],
    capabilities: dict[str, bool] | None,
) -> Any:
    """Build the shared list response for permission-bounded derived registers.

    Processes, Assets, and Threats derive filters, facets, and multi-membership
    groups from one readable candidate set. Keeping response assembly here makes
    their summary/drilldown behavior identical to the SQL listing lifecycle.
    """
    return response_model(
        items=[] if criteria.group_by and not criteria.group_value else result.page_items,
        total=len(result.matching_items),
        offset=criteria.offset,
        limit=criteria.limit,
        capabilities=capabilities,
        groups=result.groups,
        facets=result.facets,
    )


def build_register_listing_plan(
    *,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[TModel, TItem],
    serialize_sql_items: SerializeItems[TModel, TItem] | None = None,
    total: int | None = None,
    load_total: LoadTotal | None = None,
    sql_group_keys: Collection[str] = frozenset(),
    load_sql_groups: LoadSqlGroups | None = None,
    build_sql_group_filter: BuildSqlGroupFilter | None = None,
    sql_group_query_transform: QueryTransform | None = None,
    build_in_memory_grouped_page: BuildInMemoryGroupedPage[TItem] | None = None,
    facets: dict[str, Any] | None = None,
) -> RegisterListingPlan[TModel, TItem]:
    return RegisterListingPlan(
        ordered_query=ordered_query,
        listing_definition=CollectionListingDefinition(
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
            facets=facets,
        ),
    )


async def execute_register_listing_plan(
    *,
    db: Any,
    response_model: type[Any],
    query: CollectionQuery,
    plan: RegisterListingPlan[TModel, TItem],
) -> Any:
    return await execute_collection_listing_with_definition(
        db=db,
        response_model=response_model,
        query=query,
        ordered_query=plan.ordered_query,
        definition=plan.listing_definition,
    )


async def execute_register_listing_export(
    *,
    db: Any,
    query: CollectionQuery,
    plan: RegisterListingPlan[TModel, TItem],
) -> list[TItem]:
    return await execute_collection_export_with_definition(
        db=db,
        query=query,
        ordered_query=plan.ordered_query,
        definition=plan.listing_definition,
    )


async def load_register_listing_export_models(
    *,
    db: Any,
    query: CollectionQuery,
    plan: RegisterListingPlan[TModel, TItem],
) -> list[TModel]:
    return await load_collection_export_models_with_definition(
        db=db,
        query=query,
        ordered_query=plan.ordered_query,
        definition=plan.listing_definition,
    )
