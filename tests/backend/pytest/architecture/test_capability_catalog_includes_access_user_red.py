"""D-N2: capability-catalog.json must list access_user as a capability surface."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CATALOG = REPO_ROOT / "docs/security/capability-catalog.json"
REQUIRED_FIELDS = {
    "can_edit_identity",
    "can_edit_business_access",
    "can_edit_role",
    "can_deactivate",
    "can_change_active_status",
    "can_break_glass_enable",
    "can_revoke_sessions",
}


def _access_user_surface() -> dict:
    data = json.loads(CATALOG.read_text())
    for entry in data.get("surfaces", []):
        if entry.get("id") == "access_user":
            return entry
    raise AssertionError("access_user surface missing")


def test_access_user_surface_present() -> None:
    data = json.loads(CATALOG.read_text())
    surface_ids = {entry["id"] for entry in data.get("surfaces", [])}
    assert "access_user" in surface_ids
    assert len(surface_ids) >= 8


def test_access_user_carries_required_fields_and_schema_refs() -> None:
    entry = _access_user_surface()
    assert set(entry.get("fields", [])) == REQUIRED_FIELDS
    assert entry["backend"] == {
        "path": "backend/app/schemas/access.py",
        "class": "AccessUserCapabilities",
    }
    assert entry["frontend"] == {
        "path": "frontend/src/services/api/schemas/entities/identity.ts",
        "schema": "accessUserCapabilitiesSchema",
    }
