from __future__ import annotations

import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CONSOLE_MODULE = REPO_ROOT / "backend/app/api/v1/endpoints/admin/console.py"
RESERVED_MODULES = REPO_ROOT / "backend/app/api/v1/endpoints/_reserved_modules.toml"


def test_empty_admin_console_module_is_removed() -> None:
    assert not CONSOLE_MODULE.exists()


def test_admin_console_is_not_reserved_as_empty_compatibility_module() -> None:
    reserved = tomllib.loads(RESERVED_MODULES.read_text()).get("reserved", [])
    endpoint_modules = [
        item for item in reserved
        if item.get("kind") == "endpoint_module" and item.get("name") == "admin.console"
    ]

    assert endpoint_modules == []
