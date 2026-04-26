from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.snapshot_periods import (
    build_current_quarter_snapshot_context,
    get_quarter_end,
    get_quarter_label,
    get_quarter_number,
    get_quarter_start,
)
from app.core.snapshot_service import save_quarter_snapshot
from app.models import Department
from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot, SnapshotType


def test_quarter_period_helpers_return_utc_boundaries_and_labels():
    dt = datetime(2026, 4, 26, 12, 0, tzinfo=timezone.utc)

    assert get_quarter_label(dt) == "2026-Q2"
    assert get_quarter_number(dt) == 2
    assert get_quarter_start(2026, 2) == datetime(2026, 4, 1, tzinfo=timezone.utc)
    assert get_quarter_end(2026, 2) == datetime(2026, 7, 1, tzinfo=timezone.utc)
    assert get_quarter_end(2026, 4) == datetime(2027, 1, 1, tzinfo=timezone.utc)


def test_current_quarter_snapshot_context_preserves_storage_rules():
    now = datetime(2026, 4, 26, 12, 0, tzinfo=timezone.utc)

    global_context = build_current_quarter_snapshot_context(now=now, department_ids=None, notes=None)
    scoped_context = build_current_quarter_snapshot_context(now=now, department_ids=[42], notes="manual")
    multi_dept_context = build_current_quarter_snapshot_context(now=now, department_ids=[42, 43], notes=None)

    assert global_context.quarter_label == "2026-Q2"
    assert global_context.year == 2026
    assert global_context.quarter_number == 2
    assert global_context.department_id is None
    assert global_context.snapshot_type == SnapshotType.QUARTER_END
    assert scoped_context.department_id == 42
    assert scoped_context.snapshot_type == SnapshotType.MANUAL
    assert multi_dept_context.department_id is None


@pytest.mark.asyncio
async def test_save_quarter_snapshot_updates_existing_snapshot(db_session: AsyncSession):
    original = await save_quarter_snapshot(
        db=db_session,
        quarter_label="2026-Q2",
        year=2026,
        quarter_number=2,
        metrics={"priority_risks": 1},
        snapshot_type=SnapshotType.QUARTER_END,
    )
    await db_session.commit()

    updated = await save_quarter_snapshot(
        db=db_session,
        quarter_label="2026-Q2",
        year=2026,
        quarter_number=2,
        metrics={"priority_risks": 7},
        snapshot_type="manual",
        notes="refresh",
    )
    await db_session.commit()

    assert updated.id == original.id
    assert updated.metrics == {"priority_risks": 7}
    assert updated.snapshot_type == SnapshotType.MANUAL
    assert updated.notes == "refresh"


@pytest.mark.asyncio
async def test_admin_snapshot_capture_and_list_returns_manual_snapshot(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
):
    capture_response = await client_platform_admin.post(
        "/api/v1/admin/snapshots/capture",
        params={"notes": "Security regression capture"},
    )
    assert capture_response.status_code == 200
    capture_payload = capture_response.json()
    assert capture_payload["quarter"]
    assert isinstance(capture_payload["year"], int)
    assert 1 <= capture_payload["quarter_number"] <= 4
    assert isinstance(capture_payload["metrics"], dict)

    list_response = await client_platform_admin.get("/api/v1/admin/snapshots")
    assert list_response.status_code == 200
    snapshots = list_response.json()
    assert snapshots
    assert any(
        item["quarter"] == capture_payload["quarter"] and item["snapshot_type"] == "manual" for item in snapshots
    )

    saved = await db_session.execute(
        select(QuarterlyMetricSnapshot).where(
            QuarterlyMetricSnapshot.quarter == capture_payload["quarter"],
            QuarterlyMetricSnapshot.department_id.is_(None),
        )
    )
    snapshot = saved.scalar_one()
    assert snapshot.snapshot_type == SnapshotType.MANUAL
    assert snapshot.snapshot_type.value == "manual"

    scoped_saved = await db_session.execute(
        select(QuarterlyMetricSnapshot).where(
            QuarterlyMetricSnapshot.quarter == capture_payload["quarter"],
            QuarterlyMetricSnapshot.department_id == test_department.id,
        )
    )
    scoped_snapshot = scoped_saved.scalar_one()
    assert scoped_snapshot.snapshot_type == SnapshotType.MANUAL

    assert len(snapshots) == 1


@pytest.mark.asyncio
async def test_admin_snapshot_get_returns_captured_snapshot(client_platform_admin: AsyncClient):
    capture_response = await client_platform_admin.post(
        "/api/v1/admin/snapshots/capture",
        params={"notes": "Security regression capture for get"},
    )
    assert capture_response.status_code == 200
    capture_payload = capture_response.json()

    get_response = await client_platform_admin.get(f"/api/v1/admin/snapshots/{capture_payload['quarter']}")
    assert get_response.status_code == 200
    payload = get_response.json()
    assert payload["quarter"] == capture_payload["quarter"]
    assert payload["year"] == capture_payload["year"]
    assert payload["quarter_number"] == capture_payload["quarter_number"]
    assert isinstance(payload["metrics"], dict)


@pytest.mark.asyncio
async def test_admin_snapshot_endpoints_reject_non_admin(client_cro: AsyncClient):
    capture_response = await client_cro.post(
        "/api/v1/admin/snapshots/capture",
        params={"notes": "unauthorized"},
    )
    assert capture_response.status_code == 403

    list_response = await client_cro.get("/api/v1/admin/snapshots")
    assert list_response.status_code == 403

    get_response = await client_cro.get("/api/v1/admin/snapshots/2026-Q1")
    assert get_response.status_code == 403
