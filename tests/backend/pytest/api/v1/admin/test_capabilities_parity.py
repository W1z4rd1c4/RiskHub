"""AdminConsoleCapabilities: Pydantic field set equals Zod and catalog field sets."""

from __future__ import annotations

import json
import pathlib
import re

import pytest

from app.schemas.admin import AdminConsoleCapabilities

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[6]
ZOD_FILE = REPO_ROOT / "frontend/src/services/api/schemas/admin.ts"
CATALOG_FILE = REPO_ROOT / "docs/security/capability-catalog.json"


def _zod_field_names(src: str, schema_name: str) -> set[str]:
    pattern = re.compile(
        rf"\bexport\s+const\s+{schema_name}\b(?:\s*:\s*[^=]+)?\s*=\s*passthroughObject\s*\(",
        re.DOTALL,
    )
    match = pattern.search(src)
    assert match, f"could not locate {schema_name}"
    open_brace = src.find("{", match.end())
    assert open_brace != -1, f"could not locate {schema_name} body"
    depth = 0
    for index, char in enumerate(src[open_brace:], start=open_brace):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                body = src[open_brace + 1:index]
                return set(re.findall(r"\b([a-z_][a-z_0-9]*)\s*:\s*z\.boolean\(\)", body))
    raise AssertionError(f"could not locate {schema_name} closing brace")


def _catalog_field_names(surface_id: str) -> set[str]:
    catalog = json.loads(CATALOG_FILE.read_text())
    for surface in catalog["surfaces"]:
        if surface.get("id") == surface_id:
            fields = surface.get("fields")
            assert isinstance(fields, list)
            return set(fields)
    raise AssertionError(f"could not locate {surface_id} in capability catalog")


def test_admin_capabilities_pydantic_zod_parity() -> None:
    pydantic_fields = set(AdminConsoleCapabilities.model_fields.keys())
    zod_fields = _zod_field_names(ZOD_FILE.read_text(), "adminConsoleCapabilitiesSchema")
    catalog_fields = _catalog_field_names("admin_console_capabilities")

    assert pydantic_fields == zod_fields == catalog_fields
