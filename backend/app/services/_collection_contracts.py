from __future__ import annotations

from collections.abc import Awaitable, Callable, Collection, Sequence
from dataclasses import dataclass
from inspect import isawaitable
from typing import Any, TypeVar

from pydantic import BaseModel, Field
from sqlalchemy import false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.collection import CollectionGroupRead

TModel = TypeVar("TModel")
TItem = TypeVar("TItem")
TResponse = TypeVar("TResponse")


class CollectionSort(BaseModel):
    field: str
    direction: str = "asc"


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
    query: Any,
    ordered_query: Any,
    definition: CollectionListingDefinition,
) -> TResponse:
    async def resolved_total() -> int:
        if definition.total is not None:
            return definition.total
        if definition.load_total is None:
            raise ValueError("Collection listing requires total or load_total")
        return await definition.load_total()

    if query.group_by and query.group_by in definition.sql_group_keys:
        if definition.load_sql_groups is None or definition.build_sql_group_filter is None:
            raise ValueError("SQL collection grouping requires group loader and filter builder")
        groups = await definition.load_sql_groups(query.group_by)
        if is_group_summary_request(query):
            return build_collection_response(
                response_model,
                query=query,
                items=[],
                total=await resolved_total(),
                groups=groups,
                capabilities=definition.capabilities,
            )

        group_filter = await _resolve_maybe_awaitable(
            definition.build_sql_group_filter(query.group_by, query.group_value)
        )
        grouped_query = (
            ordered_query
            if definition.sql_group_query_transform is None
            else definition.sql_group_query_transform(ordered_query)
        )
        grouped_query = apply_collection_group_filter(grouped_query, group_filter)
        grouped_total = await count_collection_rows(db, grouped_query)
        models = await load_collection_scalars_page(db, grouped_query, offset=query.offset, limit=query.limit)
        sql_serializer = definition.serialize_sql_items or definition.serialize_items
        items = await sql_serializer(models)
        return build_collection_response(
            response_model,
            query=query,
            items=items,
            total=grouped_total,
            groups=groups,
            capabilities=definition.capabilities,
        )

    if query.group_by:
        if definition.build_in_memory_grouped_page is None:
            raise ValueError(f"No collection grouping executor registered for {query.group_by!r}")
        result = await db.execute(ordered_query)
        models = list(result.scalars().all())
        all_items = await definition.serialize_items(models)
        paginated_items, grouped_total, groups = definition.build_in_memory_grouped_page(all_items, query)
        return build_collection_response(
            response_model,
            query=query,
            items=paginated_items,
            total=grouped_total,
            groups=groups,
            capabilities=definition.capabilities,
        )

    models = await load_collection_scalars_page(db, ordered_query, offset=query.offset, limit=query.limit)
    items = await definition.serialize_items(models)
    return build_collection_response(
        response_model,
        query=query,
        items=items,
        total=await resolved_total(),
        capabilities=definition.capabilities,
    )
