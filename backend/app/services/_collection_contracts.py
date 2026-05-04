from __future__ import annotations

from collections.abc import Awaitable, Callable, Collection, Iterable, Sequence
from dataclasses import dataclass
from inspect import isawaitable
from typing import Any, Literal, TypeVar

from pydantic import BaseModel, Field
from sqlalchemy import false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.collection import CollectionGroupRead

TModel = TypeVar("TModel")
TItem = TypeVar("TItem")
TResponse = TypeVar("TResponse")


class CollectionSort(BaseModel):
    field: str
    direction: Literal["asc", "desc"] = "asc"


class CollectionQuery(BaseModel):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1)
    sort: CollectionSort | None = None
    filters: dict[str, Any] = Field(default_factory=dict)
    group_by: str | None = None
    group_value: str | None = None


@dataclass(frozen=True)
class CollectionGroupEntry:
    value: str
    label: str
    meta: dict[str, Any] | None = None


SerializeItems = Callable[[Sequence[TModel]], Awaitable[list[TItem]]]
LoadSqlGroups = Callable[[str], Awaitable[list[CollectionGroupRead]]]
BuildSqlGroupFilter = Callable[[str, str | None], Any | Awaitable[Any]]
QueryTransform = Callable[[Any], Any]
LoadTotal = Callable[[], Awaitable[int]]
BuildInMemoryGroupedPage = Callable[
    [list[TItem], CollectionQuery],
    tuple[list[TItem], int, list[CollectionGroupRead]],
]


@dataclass(frozen=True)
class CollectionListingDefinition:
    capabilities: dict[str, bool] | None
    serialize_items: SerializeItems[Any, Any]
    serialize_sql_items: SerializeItems[Any, Any] | None = None
    total: int | None = None
    load_total: LoadTotal | None = None
    sql_group_keys: Collection[str] = frozenset()
    load_sql_groups: LoadSqlGroups | None = None
    build_sql_group_filter: BuildSqlGroupFilter | None = None
    sql_group_query_transform: QueryTransform | None = None
    build_in_memory_grouped_page: BuildInMemoryGroupedPage[Any] | None = None


def is_group_summary_request(query: Any) -> bool:
    return bool(query.group_by and query.group_value is None)


def build_collection_page_kwargs(
    *,
    query: Any,
    items: Sequence[TItem],
    total: int,
    groups: list[CollectionGroupRead] | None = None,
    capabilities: dict[str, bool] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "items": list(items),
        "total": total,
        "offset": query.offset,
        "limit": query.limit,
    }
    if groups is not None:
        payload["groups"] = groups
    if capabilities is not None:
        payload["capabilities"] = capabilities
    return payload


def build_collection_response(
    response_model: type[TResponse],
    *,
    query: Any,
    items: Sequence[TItem],
    total: int,
    groups: list[CollectionGroupRead] | None = None,
    capabilities: dict[str, bool] | None = None,
) -> TResponse:
    return response_model(
        **build_collection_page_kwargs(
            query=query,
            items=items,
            total=total,
            groups=groups,
            capabilities=capabilities,
        )
    )


def build_grouped_collection_response[T](
    items: Iterable[T],
    *,
    group_by: str,
    group_value: str | None,
    get_entries: Callable[[T, str], Iterable[CollectionGroupEntry]],
    is_active: Callable[[T], bool] | None = None,
    is_highlighted: Callable[[T], bool] | None = None,
) -> tuple[list[T], int, list[CollectionGroupRead]]:
    item_entries: list[tuple[T, list[CollectionGroupEntry]]] = []
    group_map: dict[str, dict[str, Any]] = {}

    for item in items:
        entries = list(get_entries(item, group_by))
        item_entries.append((item, entries))

        seen_values: set[str] = set()
        for entry in entries:
            if entry.value in seen_values:
                continue
            seen_values.add(entry.value)

            group = group_map.setdefault(
                entry.value,
                {
                    "value": entry.value,
                    "label": entry.label,
                    "count": 0,
                    "active_count": 0,
                    "highlighted_count": 0,
                    "meta": entry.meta or {},
                },
            )
            group["count"] += 1
            if is_active is None or is_active(item):
                group["active_count"] += 1
            if is_highlighted is not None and is_highlighted(item):
                group["highlighted_count"] += 1

    groups = [
        CollectionGroupRead.model_validate(group)
        for group in sorted(group_map.values(), key=lambda group: str(group["label"]).lower())
    ]

    if not group_value:
        return [], len(item_entries), groups

    grouped_items = [
        item
        for item, entries in item_entries
        if any(entry.value == group_value for entry in entries)
    ]
    return grouped_items, len(grouped_items), groups


def build_grouped_collection_page[T](
    items: Iterable[T],
    query: CollectionQuery,
    *,
    get_entries: Callable[[T, str], Iterable[CollectionGroupEntry]],
    is_active: Callable[[T], bool] | None = None,
    is_highlighted: Callable[[T], bool] | None = None,
) -> tuple[list[T], int, list[CollectionGroupRead]]:
    if not query.group_by:
        item_list = list(items)
        return item_list, len(item_list), []

    grouped_items, grouped_total, groups = build_grouped_collection_response(
        items,
        group_by=query.group_by,
        group_value=query.group_value,
        get_entries=get_entries,
        is_active=is_active,
        is_highlighted=is_highlighted,
    )
    return grouped_items[query.offset : query.offset + query.limit], grouped_total, groups


def apply_collection_group_filter(query: Any, group_filter: Any | None) -> Any:
    if group_filter is None:
        return query.where(false())
    return query.where(group_filter)


async def count_collection_rows(db: AsyncSession, query: Any) -> int:
    result = await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
    return result.scalar() or 0


async def load_collection_scalars_page(
    db: AsyncSession,
    query: Any,
    *,
    offset: int,
    limit: int,
) -> list[Any]:
    result = await db.execute(query.offset(offset).limit(limit))
    return list(result.scalars().all())


async def _resolve_maybe_awaitable(value: Any | Awaitable[Any]) -> Any:
    if isawaitable(value):
        return await value
    return value


async def execute_collection_listing_with_definition(
    *,
    db: AsyncSession,
    response_model: type[TResponse],
    query: CollectionQuery,
    ordered_query: Any,
    definition: CollectionListingDefinition,
) -> TResponse:
    return await execute_collection_listing(
        db=db,
        response_model=response_model,
        query=query,
        ordered_query=ordered_query,
        capabilities=definition.capabilities,
        serialize_items=definition.serialize_items,
        serialize_sql_items=definition.serialize_sql_items,
        total=definition.total,
        load_total=definition.load_total,
        sql_group_keys=definition.sql_group_keys,
        load_sql_groups=definition.load_sql_groups,
        build_sql_group_filter=definition.build_sql_group_filter,
        sql_group_query_transform=definition.sql_group_query_transform,
        build_in_memory_grouped_page=definition.build_in_memory_grouped_page,
    )


async def execute_collection_listing(
    *,
    db: AsyncSession,
    response_model: type[TResponse],
    query: CollectionQuery,
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
) -> TResponse:
    async def resolved_total() -> int:
        if total is not None:
            return total
        if load_total is None:
            raise ValueError("Collection listing requires total or load_total")
        return await load_total()

    if query.group_by and query.group_by in sql_group_keys:
        if load_sql_groups is None or build_sql_group_filter is None:
            raise ValueError("SQL collection grouping requires group loader and filter builder")
        groups = await load_sql_groups(query.group_by)
        if is_group_summary_request(query):
            return build_collection_response(
                response_model,
                query=query,
                items=[],
                total=await resolved_total(),
                groups=groups,
                capabilities=capabilities,
            )

        group_filter = await _resolve_maybe_awaitable(build_sql_group_filter(query.group_by, query.group_value))
        grouped_query = ordered_query if sql_group_query_transform is None else sql_group_query_transform(ordered_query)
        grouped_query = apply_collection_group_filter(grouped_query, group_filter)
        grouped_total = await count_collection_rows(db, grouped_query)
        models = await load_collection_scalars_page(db, grouped_query, offset=query.offset, limit=query.limit)
        sql_serializer = serialize_sql_items or serialize_items
        items = await sql_serializer(models)
        return build_collection_response(
            response_model,
            query=query,
            items=items,
            total=grouped_total,
            groups=groups,
            capabilities=capabilities,
        )

    if query.group_by:
        if build_in_memory_grouped_page is None:
            raise ValueError(f"No collection grouping executor registered for {query.group_by!r}")
        result = await db.execute(ordered_query)
        models = list(result.scalars().all())
        all_items = await serialize_items(models)
        paginated_items, grouped_total, groups = build_in_memory_grouped_page(all_items, query)
        return build_collection_response(
            response_model,
            query=query,
            items=paginated_items,
            total=grouped_total,
            groups=groups,
            capabilities=capabilities,
        )

    models = await load_collection_scalars_page(db, ordered_query, offset=query.offset, limit=query.limit)
    items = await serialize_items(models)
    return build_collection_response(
        response_model,
        query=query,
        items=items,
        total=await resolved_total(),
        capabilities=capabilities,
    )
