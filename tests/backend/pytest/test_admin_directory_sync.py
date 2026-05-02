from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services.ad_deprovision_service import ADDeprovisionService


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

    response = await client_employee.post(
        "/api/v1/admin/directory/break-glass-enable/123",
        json={"reason": "Emergency owner handoff", "expires_in_hours": 4},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_capabilities_endpoint_requires_admin_role(
    client_employee: AsyncClient,
):
    response = await client_employee.get("/api/v1/admin/capabilities")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_capabilities_endpoint_returns_current_action_flags(
    client_platform_admin: AsyncClient,
):
    response = await client_platform_admin.get("/api/v1/admin/capabilities")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "can_revoke_sessions": True,
        "can_run_directory_check_all": True,
        "can_update_log_config": True,
        "can_export_loaded_audit_logs": True,
    }


@pytest.mark.asyncio
async def test_admin_break_glass_enable_reactivates_directory_deprovisioned_user(
    client_platform_admin: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
):
    test_user_employee.external_id = "oid-break-glass-endpoint"
    test_user_employee.is_active = False
    test_user_employee.deprovision_reason = ADDeprovisionService.DEPROVISION_REASON_DIRECTORY_DISABLED
    db_session.add(test_user_employee)
    await db_session.commit()

    response = await client_platform_admin.post(
        f"/api/v1/admin/directory/break-glass-enable/{test_user_employee.id}",
        json={"reason": "Emergency owner handoff", "expires_in_hours": 4},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"status": "success", "user_id": test_user_employee.id}

    refreshed_user = (await db_session.execute(select(User).where(User.id == test_user_employee.id))).scalar_one()
    assert refreshed_user.is_active is True
    assert refreshed_user.break_glass_reason == "Emergency owner handoff"
    assert refreshed_user.break_glass_expires_at is not None
