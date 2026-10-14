"""Separate durable architecture declarations from expiring debt exceptions.

Consumers choose the policy; changing a registry's metadata cannot opt debt out
of expiry. Empty exception registries have nothing to expire.
"""

from __future__ import annotations

import tomllib
from datetime import date
from pathlib import Path
from typing import Any


def _load_registry(path: Path, *, kind: str, decision: str) -> dict[str, Any]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    assert data.get("schema_version") == 1, f"{path}: unsupported or missing schema_version"
    assert data.get("kind") == kind, f"{path}: expected kind={kind}"
    assert data.get("decision") == decision, f"{path}: expected decision={decision}"
    assert "expires_at" not in data, f"{path}: expiry belongs to each temporary exception"
    return data


def load_architecture_registry(path: Path, *, decision: str) -> dict[str, Any]:
    """Load an accepted architecture declaration, whose scope is locked by its consumer."""
    return _load_registry(path, kind="architecture", decision=decision)


def load_exception_registry(
    path: Path,
    *,
    decision: str,
    entries_key: str,
    today: date | None = None,
) -> dict[str, Any]:
    """Require an owner, rationale and inclusive calendar expiry on every exception."""
    data = _load_registry(path, kind="temporary_exceptions", decision=decision)
    entries = data.get(entries_key)
    assert isinstance(entries, list), f"{path}: missing {entries_key} array"
    current_day = today if today is not None else date.today()
    for entry in entries:
        assert isinstance(entry, dict), f"{path}: exceptions must be metadata tables"
        for key in ("owner", "rationale", "expires_at"):
            value = entry.get(key)
            assert isinstance(value, str) and value.strip(), f"{path}: exception missing {key}: {entry!r}"
        try:
            expiry = date.fromisoformat(entry["expires_at"])
        except ValueError as error:
            raise AssertionError(f"{path}: invalid expires_at: {entry!r}") from error
        assert expiry >= current_day, f"{path}: exception expires_at={expiry} elapsed: {entry!r}"
    return data
