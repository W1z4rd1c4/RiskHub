"""Lock the quarterly comparison facade re-export contract."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
FACADE_PATH = REPO_ROOT / "backend/app/services/quarterly_comparison_service.py"
AUDIT_CONTEXT = REPO_ROOT / ".planning/audits/_context/01-backend-services.md"


def test_facade_module_present_and_re_exports_canonical() -> None:
    facade = importlib.import_module("app.services.quarterly_comparison_service")
    canonical = importlib.import_module("app.services._quarterly_comparison")
    for name in getattr(canonical, "__all__", ()):
        assert hasattr(facade, name), f"facade missing canonical re-export: {name}"


def test_facade_keep_decision_is_documented() -> None:
    facade_text = FACADE_PATH.read_text()
    audit_text = AUDIT_CONTEXT.read_text()

    assert "audit #57" in facade_text.lower()
    assert "Reject" in facade_text
    assert "test_quarterly_comparison_facade_present_red.py" in audit_text
