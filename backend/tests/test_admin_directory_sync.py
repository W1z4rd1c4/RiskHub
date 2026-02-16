from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_admin_check_user_endpoint_calls_service(
    client_platform_admin: AsyncClient,
    monkeypatch,
):
    async def stub_check_user_by_id(db, *, user_id: int, settings, actor=None, trigger="manual_check_user"):
        assert user_id == 123
        assert trigger == "admin_check_user"
        assert actor is not None
        return {
            "user_id": user_id,
            "email": "target@example.com",
            "status": "active",
            "reason": None,
            "revoked_sessions": 0,
            "orphaned_items_flagged": 0,
        }

    monkeypatch.setattr(
        "app.services.ad_deprovision_service.ADDeprovisionService.check_user_by_id",
        stub_check_user_by_id,
    )

    response = await client_platform_admin.post("/api/v1/admin/directory/check-user/123")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "active"


@pytest.mark.asyncio
async def test_admin_check_all_endpoint_returns_summary(
    client_platform_admin: AsyncClient,
    monkeypatch,
):
    async def stub_check_all_users(db, *, settings, actor=None, trigger="manual_check_all"):
        assert trigger == "admin_check_all"
        assert actor is not None
        return {
            "checked": 2,
            "deprovisioned": 1,
            "active": 1,
            "errors": 0,
            "skipped": 0,
            "results": [],
        }

    monkeypatch.setattr(
        "app.services.ad_deprovision_service.ADDeprovisionService.check_all_users",
        stub_check_all_users,
    )

    response = await client_platform_admin.post("/api/v1/admin/directory/check-all")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["checked"] == 2
    assert body["deprovisioned"] == 1


@pytest.mark.asyncio
async def test_admin_directory_endpoints_require_admin_role(
    client_employee: AsyncClient,
):
    response = await client_employee.post("/api/v1/admin/directory/check-all")
    assert response.status_code == 403
