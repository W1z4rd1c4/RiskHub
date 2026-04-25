from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from enum import Enum
from typing import Any, Literal

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, ValidationError

from app.schemas.collection import CollectionGroupRead


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
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid sort payload",
            ) from exc

    filters_payload: dict[str, Any] = {}
    if filters:
        try:
            loaded_filters = json.loads(filters)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid filters payload",
            ) from exc
        if not isinstance(loaded_filters, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid collection query",
        ) from exc

    return query


def merge_collection_filters(
    query: CollectionQuery,
    defaults: dict[str, Any],
) -> dict[str, Any]:
    return defaults | query.filters


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
    paginated_items = (
        grouped_items[query.offset : query.offset + query.limit]
        if query.group_value
        else []
    )
    return paginated_items, grouped_total, groups
