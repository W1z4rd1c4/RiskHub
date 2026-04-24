"""Tests for unified export pipeline orchestration helpers."""

from datetime import date
from typing import Any

import pytest
from fastapi.responses import StreamingResponse

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
