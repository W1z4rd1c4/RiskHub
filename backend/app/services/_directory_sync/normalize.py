from __future__ import annotations

import hashlib
from typing import Any


def _normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    email = value.strip().lower()
    if "@" not in email:
        return None
    return email


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _display_name(user_data: dict[str, Any], fallback_email: str | None) -> str:
    if user_data.get("display_name"):
        return user_data["display_name"].strip()
    given = (user_data.get("given_name") or "").strip()
    surname = (user_data.get("surname") or "").strip()
    combined = (f"{given} {surname}").strip()
    if combined:
        return combined
    if fallback_email:
        return fallback_email
    return user_data.get("external_id", "")


def _email_sha256(value: str | None) -> str:
    if not value:
        return "none"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

