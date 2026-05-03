"""Tests for unified export pipeline orchestration helpers."""

import ast
from datetime import date
from inspect import getsource
from typing import Any

import pytest
from fastapi.responses import StreamingResponse

from app.api.v1.endpoints.reports.unified_exports import (
    export_controls,
    export_issues,
    export_kris,
    export_risks,
    export_vendors,
)
from app.api.v1.endpoints.reports.unified_exports.pipeline import (
    ExportPipelineDefinition,
    apply_export_stages,
    render_export_pipeline,
)


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
