"""capabilities.py uses build_admin_capabilities: no literal True stub."""

from __future__ import annotations

import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[6]
TARGET = REPO_ROOT / "backend/app/api/v1/endpoints/admin/capabilities.py"


def test_capabilities_endpoint_uses_builder() -> None:
    src = TARGET.read_text()
    assert "build_admin_capabilities" in src
    assert "_ = current_user" not in src
    body = src.split("def get_admin_console_capabilities", 1)[1]
    assert "True" not in body, "literal True must not appear in endpoint body"
