from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.services._collection_contracts import (
    CollectionGroupEntry,
    CollectionQuery,
    CollectionSort,
    build_grouped_collection_page,
    is_group_summary_request,
)
from app.services._collection_filters import (
    coerce_optional_bool,
    coerce_optional_enum,
    coerce_optional_int,
    coerce_optional_string,
)

__all__ = [
    "CollectionGroupEntry",
    "CollectionListContext",
    "CollectionQuery",
    "CollectionSort",
    "build_empty_collection_page",
    "build_grouped_collection_page",
    "build_list_context",
    "coerce_optional_bool",
    "coerce_optional_enum",
    "coerce_optional_int",
    "coerce_optional_string",
    "is_group_summary_request",
    "merge_collection_filters",
    "parse_collection_query",
]


@dataclass(frozen=True)
class CollectionListContext:
    query: CollectionQuery
    filters: dict[str, Any]

    @property
    def is_group_summary(self) -> bool:
        return is_group_summary_request(self.query)

    @property
    def is_grouped_drilldown(self) -> bool:
        return bool(self.query.group_by and self.query.group_value)


def parse_collection_query(
    *,
    offset: int = 0,
    limit: int = 50,
    sort: str | None = None,
    filters: str | None = None,
    group_by: str | None = None,
    group_value: str | None = None,
    max_limit: int = 100,
) -> CollectionQuery:
    sort_payload: CollectionSort | None = None
    if sort:
        try:
            sort_payload = CollectionSort.model_validate(json.loads(sort))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid sort payload",
            ) from exc

    filters_payload: dict[str, Any] = {}
    if filters:
        try:
            loaded_filters = json.loads(filters)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid filters payload",
            ) from exc
        if not isinstance(loaded_filters, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="filters payload must be an object",
            )
        filters_payload = loaded_filters

    try:
        query = CollectionQuery.model_validate(
            {
                "offset": offset,
                "limit": min(limit, max_limit),
                "sort": sort_payload,
                "filters": filters_payload,
                "group_by": group_by,
                "group_value": group_value,
            }
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid collection query",
        ) from exc

    return query


def build_list_context(
    *,
    offset: int = 0,
    limit: int = 50,
    sort: str | None = None,
    filters: str | None = None,
    group_by: str | None = None,
    group_value: str | None = None,
    legacy_filters: dict[str, Any] | None = None,
    max_limit: int = 100,
) -> CollectionListContext:
    query = parse_collection_query(
        offset=offset,
        limit=limit,
        sort=sort,
        filters=filters,
        group_by=group_by,
        group_value=group_value,
        max_limit=max_limit,
    )
    return CollectionListContext(
        query=query,
        filters=merge_collection_filters(query, legacy_filters or {}),
    )


def merge_collection_filters(
    query: CollectionQuery,
    defaults: dict[str, Any],
) -> dict[str, Any]:
    return defaults | query.filters


def build_empty_collection_page(
    context: CollectionListContext,
    *,
    capabilities: dict[str, bool] | None = None,
) -> dict[str, Any]:
    return {
        "items": [],
        "total": 0,
        "offset": context.query.offset,
        "limit": context.query.limit,
        "groups": [],
        "capabilities": capabilities,
    }
