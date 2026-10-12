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

    from app.api.v1.endpoints.reports.unified_exports import routes as adapter
    from app.services import _reporting
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    assert adapter.get_export_builder is _reporting.get_export_builder
    assert violations(routes, adapter.__name__, load_surfaces(REPO_ROOT)) == []
    assert "from .exports import" not in routes


def test_reporting_exports_monitoring_alias_deleted() -> None:
    assert not (CANONICAL_EXPORTS / "monitoring.py").exists()


@pytest.mark.parametrize("target", ["dispatcher", "summary", "audit", "vendor"])
def test_adapter_identity_locks_reject_seeded_wrapper_bypass(monkeypatch, target):
    from importlib import import_module

    from tests.backend.pytest.api.v1 import test_reports_export_pipeline as pipeline
    from tests.backend.pytest.architecture import test_reporting_docs_adapters_red as docs
    from tests.backend.pytest.architecture import test_w6_bc_d_register_listing_centralization as listings

    if target == "dispatcher":
        adapter = import_module("app.api.v1.endpoints.reports.unified_exports.routes")
        name = "get_export_builder"
        check = pipeline.test_unified_export_routes_select_builders_from_canonical_exports_interface
    elif target == "vendor":
        adapter = import_module("app.api.v1.endpoints.vendors.crud")
        name = "list_vendor_governance"
        check = listings.test_vendor_listing_orchestration_lives_in_register_listings_module
    else:
        endpoint = docs.SUMMARY_ENDPOINT if target == "summary" else docs.AUDIT_TRAIL_ENDPOINT
        adapter = import_module("app.api.v1.endpoints.reports." + endpoint.stem)
        name = "build_summary_export" if target == "summary" else "build_audit_trail_export"
        def check():
            docs.test_report_excel_endpoints_delegate_report_assembly_to_service(endpoint)
    canonical = getattr(adapter, name)
    monkeypatch.setattr(adapter, name, lambda *args, **kwargs: canonical(*args, **kwargs))
    with pytest.raises(AssertionError):
        check()
