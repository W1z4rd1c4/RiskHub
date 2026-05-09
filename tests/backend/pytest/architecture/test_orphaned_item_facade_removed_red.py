"""Lock OrphanedItemService facade and static-method class removal."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_orphaned_item_service_facade_module_deleted() -> None:
    facade = REPO_ROOT / "backend/app/services/orphaned_item_service.py"
    assert not facade.exists()


def test_orphaned_item_service_class_removed_from_internal_package() -> None:
    try:
        service_mod = importlib.import_module("app.services._orphaned_items.service")
    except ModuleNotFoundError:
        return
    assert not hasattr(service_mod, "OrphanedItemService")


def test_endpoints_do_not_reference_orphaned_item_service() -> None:
    endpoint_path = REPO_ROOT / "backend/app/api/v1/endpoints/orphaned_items.py"
    source = endpoint_path.read_text(encoding="utf-8")
    assert "OrphanedItemService" not in source
    assert "orphaned_item_service" not in source


def test_module_level_orphan_functions_directly_callable() -> None:
    pkg = importlib.import_module("app.services._orphaned_items")
    for name in (
        "scan_uncategorised_items",
        "get_pending_orphans_with_details",
        "get_orphan_stats",
        "get_orphan_detail",
        "resolve_orphan",
    ):
        assert callable(getattr(pkg, name, None)), name
