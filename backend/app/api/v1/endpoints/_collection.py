from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from typing import Any

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.services._collection_contracts import (
    CollectionGroupEntry,
    CollectionQuery,
    CollectionSort,
    build_grouped_collection_page,
    build_grouped_collection_response,
    is_group_summary_request,
)


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


def coerce_optional_enum[E: Enum](enum_cls: type[E], value: Any, field_name: str) -> E | None:
    if value is None or value == "":
        return None
    if isinstance(value, enum_cls):
        return value
    try:
        return enum_cls(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {field_name} filter value",
        ) from exc


def _invalid_filter(field_name: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail=f"Invalid {field_name} filter value",
    )


def coerce_optional_int(
    field_name: str,
    value: Any,
    *,
    min_value: int | None = None,
    max_value: int | None = None,
) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise _invalid_filter(field_name)
    if isinstance(value, int):
        coerced = value
    elif isinstance(value, str):
        raw_value = value.strip()
        if not raw_value or not raw_value.lstrip("-").isdigit():
            raise _invalid_filter(field_name)
        coerced = int(raw_value)
    else:
        raise _invalid_filter(field_name)

    if min_value is not None and coerced < min_value:
        raise _invalid_filter(field_name)
    if max_value is not None and coerced > max_value:
        raise _invalid_filter(field_name)
    return coerced


def coerce_optional_bool(field_name: str, value: Any) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        if value == 0:
            return False
        if value == 1:
            return True
        raise _invalid_filter(field_name)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    raise _invalid_filter(field_name)


def coerce_optional_string(field_name: str, value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise _invalid_filter(field_name)
    return value or None


def coerce_optional_literal(field_name: str, value: Any, allowed_values: set[str]) -> str | None:
    coerced = coerce_optional_string(field_name, value)
    if coerced is None:
        return None
    if coerced not in allowed_values:
        raise _invalid_filter(field_name)
    return coerced
