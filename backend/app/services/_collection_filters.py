from __future__ import annotations

from enum import Enum
from typing import Any

from fastapi import HTTPException


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


def merge_collection_filters(query: Any, defaults: dict[str, Any]) -> dict[str, Any]:
    return defaults | getattr(query, "filters", {})
