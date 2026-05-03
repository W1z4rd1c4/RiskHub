from __future__ import annotations

from collections.abc import Sequence
from typing import Any, TypeVar

from sqlalchemy import false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints._collection import CollectionQuery
from app.schemas.collection import CollectionGroupRead

TItem = TypeVar("TItem")
TResponse = TypeVar("TResponse")


def build_collection_page_kwargs(
    *,
    query: CollectionQuery,
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
    query: CollectionQuery,
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
