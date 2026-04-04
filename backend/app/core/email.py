from __future__ import annotations

from typing import Any

from sqlalchemy import func


def normalize_email(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def require_normalized_email(value: str | None, *, field_name: str = "email") -> str:
    normalized = normalize_email(value)
    if normalized is None:
        raise ValueError(f"{field_name} must not be empty")
    return normalized


def email_equals(column: Any, value: str | None):
    return func.lower(column) == require_normalized_email(value)
