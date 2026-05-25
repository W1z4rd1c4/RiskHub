from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
UNIFIED_EXPORTS = REPO_ROOT / "backend/app/api/v1/endpoints/reports/unified_exports"
CANONICAL_EXPORTS = REPO_ROOT / "backend/app/services/_reporting/exports"

DELETED_COMPATIBILITY_SHIMS = {
    "_shared.py",
    "export_builders.py",
    "export_controls.py",
    "export_issues.py",
    "export_kris.py",
    "export_monitoring.py",
    "export_risks.py",
    "export_vendors.py",
    "exports.py",
    "fetch.py",
    "filters.py",
    "pipeline.py",
    "rehydrate.py",
    "render.py",
    "rows.py",
}


def test_unified_export_endpoint_compatibility_shims_are_deleted() -> None:
    remaining = sorted(path.name for path in UNIFIED_EXPORTS.glob("*.py") if path.name in DELETED_COMPATIBILITY_SHIMS)
    assert remaining == []


def test_unified_export_routes_import_canonical_export_service_builders() -> None:
    routes = (UNIFIED_EXPORTS / "routes.py").read_text()

    assert "from app.services._reporting.exports" in routes
    assert "from .exports import" not in routes


def test_reporting_exports_monitoring_alias_deleted() -> None:
    assert not (CANONICAL_EXPORTS / "monitoring.py").exists()
