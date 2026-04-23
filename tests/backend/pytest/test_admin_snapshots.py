from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department
from app.models.quarterly_metric_snapshot import QuarterlyMetricSnapshot, SnapshotType


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
