"""Tests for unified export pipeline orchestration helpers."""

import ast
from datetime import date
from inspect import getsource
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.responses import StreamingResponse

from app.models.user import AccessScope
from app.services._reporting import exports as export_registry
from app.services._reporting.exports import controls as export_controls
from app.services._reporting.exports import issues as export_issues
from app.services._reporting.exports import kris as export_kris
from app.services._reporting.exports import risks as export_risks
from app.services._reporting.exports import vendors as export_vendors
from app.services._reporting.exports.filters import _filter_rows_by_final_scope, _filter_rows_by_vendor_criteria
from app.services._reporting.exports.pipeline import (
    ExportPipelineDefinition,
    apply_export_stages,
    render_export_pipeline,
)

REPORT_ROUTES = "backend/app/api/v1/endpoints/reports/unified_exports/routes.py"


@pytest.mark.asyncio
async def test_apply_export_stages_runs_sync_and_async_stages_in_order():
    calls: list[str] = []

    def sync_stage(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        calls.append("sync")
        return [{**row, "sync": True} for row in rows]

    async def async_stage(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        calls.append("async")
        return [{**row, "async": True} for row in rows]

    rows = await apply_export_stages([{"name": "Vendor A"}], [sync_stage, async_stage])

    assert calls == ["sync", "async"]
    assert rows == [{"name": "Vendor A", "sync": True, "async": True}]


@pytest.mark.asyncio
async def test_render_export_pipeline_filters_rows_and_hands_off_render_payload():
    captured: dict[str, Any] = {}

    def render_export(**kwargs: Any) -> StreamingResponse:
        captured.update(kwargs)
        return StreamingResponse(iter([b"ok"]))

    response = await render_export_pipeline(
        definition=ExportPipelineDefinition(
            title="Vendor Export",
            sheet_name="Vendors",
            filename_base="vendors",
            headers=["Name", "Status"],
        ),
        export_format="csv",
        as_of_date=date(2026, 4, 24),
        rows=[
            {"name": "Keep", "status": "active"},
            {"name": "Drop", "status": "inactive"},
        ],
        stages=[
            lambda rows: [row for row in rows if row["status"] == "active"],
        ],
        row_values=lambda row: [row["name"], row["status"]],
        render_export=render_export,
    )

    assert isinstance(response, StreamingResponse)
    assert captured["title"] == "Vendor Export"
    assert captured["sheet_name"] == "Vendors"
    assert captured["filename_base"] == "vendors"
    assert captured["export_format"] == "csv"
    assert captured["headers"] == ["Name", "Status"]
    assert captured["data_rows"] == [["Keep", "active"]]
    assert captured["as_of_date"] == date(2026, 4, 24)


@pytest.mark.asyncio
async def test_render_export_pipeline_accepts_definition_owned_stages_and_row_values():
    captured: dict[str, Any] = {}

    def render_export(**kwargs: Any) -> StreamingResponse:
        captured.update(kwargs)
        return StreamingResponse(iter([b"ok"]))

    response = await render_export_pipeline(
        definition=ExportPipelineDefinition(
            title="Vendor Export",
            sheet_name="Vendors",
            filename_base="vendors",
            headers=["Name", "Status"],
            stages=(
                lambda rows: [row for row in rows if row["status"] == "active"],
            ),
            row_values=lambda row: [row["name"], row["status"]],
        ),
        export_format="csv",
        as_of_date=date(2026, 4, 24),
        rows=[
            {"name": "Keep", "status": "active"},
            {"name": "Drop", "status": "inactive"},
        ],
        render_export=render_export,
    )

    assert isinstance(response, StreamingResponse)
    assert captured["data_rows"] == [["Keep", "active"]]


def _render_pipeline_keyword_names(source: str) -> set[str]:
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if getattr(node.func, "id", None) in {"render_export_pipeline", "render_report_export_definition"}:
            return {keyword.arg for keyword in node.keywords if keyword.arg is not None}
    raise AssertionError("render_export_pipeline call not found")


def test_tabular_exporters_delegate_rendering_to_shared_pipeline():
    exporter_functions = [
        export_risks._export_risks,
        export_controls._export_controls,
        export_kris._export_kris,
        export_issues._export_issues,
        export_vendors._export_vendors,
    ]

    for exporter in exporter_functions:
        source = getsource(exporter)
        render_keywords = _render_pipeline_keyword_names(source)

        assert "render_report_export_definition(" in source
        assert "_render_export(" not in source
        assert "stages" not in render_keywords
        assert "row_values" not in render_keywords


def test_unified_export_routes_select_builders_from_canonical_exports_interface():
    from pathlib import Path

    from app.api.v1.endpoints.reports.unified_exports import routes as adapter
    from app.services import _reporting
    from tests.backend.pytest.architecture._private_api_boundary import load_surfaces, violations

    routes = getsource(adapter)
    assert adapter.get_export_builder is _reporting.get_export_builder
    assert violations(routes, adapter.__name__, load_surfaces(Path(__file__).resolve().parents[5])) == []
    assert "get_export_builder(" in routes

    assert "app.api.v1.endpoints.reports.unified_exports.export_" not in routes
    assert "from .exports import" not in routes


def test_unified_export_routes_select_builders_from_canonical_registry():
    expected_builders = {
        "controls": export_controls._export_controls,
        "issues": export_issues._export_issues,
        "kris": export_kris._export_kris,
        "risks": export_risks._export_risks,
        "vendors": export_vendors._export_vendors,
    }

    assert dict(export_registry.EXPORT_BUILDERS) == expected_builders
    for resource, builder in expected_builders.items():
        assert export_registry.get_export_builder(resource) is builder

    routes = getsource(__import__("app.api.v1.endpoints.reports.unified_exports.routes", fromlist=["router"]))
    assert "get_export_builder(" in routes
    for builder_name in (
        "_export_controls",
        "_export_issues",
        "_export_kris",
        "_export_risks",
        "_export_vendors",
    ):
        assert builder_name not in routes


def test_vendor_export_inactive_status_filter_is_archived_alias():
    rows = [
        {
            "name": "Live Vendor",
            "status": "active",
            "is_archived": False,
        },
        {
            "name": "Archived Vendor",
            "status": "active",
            "is_archived": True,
        },
    ]

    filtered = _filter_rows_by_vendor_criteria(
        rows,
        status_filter="inactive",
        search=None,
        vendor_type=None,
    )

    assert [row["name"] for row in filtered] == ["Archived Vendor"]


def test_vendor_export_final_scope_excludes_unassigned_rows_for_scoped_owner():
    current_user = SimpleNamespace(id=42, access_scope=AccessScope.DEPARTMENT, department_id=7, manager=None)
    rows = [
        {"name": "Owned unassigned replay", "department_id": None, "outsourcing_owner_user_id": 42},
        {"name": "Owned visible department", "department_id": 7, "outsourcing_owner_user_id": 42},
    ]

    filtered = _filter_rows_by_final_scope(
        rows,
        current_user=current_user,
        department_id=None,
        owner_field="outsourcing_owner_user_id",
        exclude_unassigned_for_scoped=True,
    )

    assert [row["name"] for row in filtered] == ["Owned visible department"]


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", ["risks", "controls", "kris", "issues", "vendors"])
async def test_public_export_requests_dispatch_and_await_declared_builder(auth_client, monkeypatch, resource):
    from app.api.v1.endpoints.reports.unified_exports import routes
    from app.services import _reporting

    assert routes.get_export_builder is _reporting.get_export_builder
    selected = []
    invoked = []

    def select_builder(name):
        selected.append(name)
        canonical = _reporting.get_export_builder(name)

        async def observed(**kwargs):
            invoked.append((name, kwargs["current_user"].id, kwargs["export_format"]))
            return await canonical(**kwargs)

        return observed

    monkeypatch.setattr(routes, "get_export_builder", select_builder)
    response = await auth_client.get(f"/api/v1/reports/{resource}/export", params={"format": "csv"})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert selected == [resource]
    assert len(invoked) == 1 and invoked[0][0] == resource and invoked[0][2] == "csv"


@pytest.mark.asyncio
@pytest.mark.parametrize("module_name,operation,path", [
    ("summary_excel", "build_summary_export", "summary"),
    ("audit_trail_excel", "build_audit_trail_export", "audit-trail"),
])
async def test_public_report_assembly_calls_declared_service(auth_client, monkeypatch, module_name, operation, path):
    from importlib import import_module

    from app.services import _reporting

    adapter = import_module(f"app.api.v1.endpoints.reports.{module_name}")
    canonical = getattr(_reporting, operation)
    assert getattr(adapter, operation) is canonical
    calls = []

    async def observed(**kwargs):
        calls.append(kwargs)
        return await canonical(**kwargs)

    monkeypatch.setattr(adapter, operation, observed)
    response = await auth_client.get(f"/api/v1/reports/{path}/export", params={"format": "csv"})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert len(calls) == 1 and calls[0]["export_format"] == "csv"
