from __future__ import annotations

from typing import Any

from .lifecycle import (
    BuildInMemoryGroupedPage,
    BuildSqlGroupFilter,
    LoadSqlGroups,
    QueryTransform,
    RegisterListingPlan,
    SerializeItems,
    _plan_register_listing,
)


def plan_issue_listing(
    *,
    ordered_query: Any,
    capabilities: dict[str, bool] | None,
    serialize_items: SerializeItems[Any, Any],
    total: int,
    sql_group_keys: set[str],
    load_sql_groups: LoadSqlGroups,
    build_sql_group_filter: BuildSqlGroupFilter,
    sql_group_query_transform: QueryTransform | None,
    build_in_memory_grouped_page: BuildInMemoryGroupedPage[Any],
) -> RegisterListingPlan:
    return _plan_register_listing(
        ordered_query=ordered_query,
        capabilities=capabilities,
        serialize_items=serialize_items,
        total=total,
        sql_group_keys=sql_group_keys,
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=build_sql_group_filter,
        sql_group_query_transform=sql_group_query_transform,
        build_in_memory_grouped_page=build_in_memory_grouped_page,
    )
