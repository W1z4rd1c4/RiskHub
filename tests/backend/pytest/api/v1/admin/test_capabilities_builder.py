"""Admin capabilities builder: per-role booleans."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Role, User
from app.models.role import RoleType
from app.models.user import AccessScope
from app.services._authorization_capabilities.admin import build_admin_capabilities

pytestmark = pytest.mark.contract


@pytest_asyncio.fixture
async def test_user_compliance(db_session: AsyncSession, test_department: Department) -> User:
    role = Role(
        name=RoleType.COMPLIANCE.value,
        display_name="Compliance",
        description="Compliance test role",
    )
    db_session.add(role)
    await db_session.flush()
    user = User(
        name="Test Compliance",
        email="compliance@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user, attribute_names=["role"])
    return user


@pytest.mark.asyncio
async def test_build_admin_capabilities_role_matrix(
    test_user_platform_admin: User,
    test_user_department_head: User,
    test_user_employee: User,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_compliance: User,
) -> None:
    cases = (
        (test_user_platform_admin, True),
        (test_user_department_head, False),
        (test_user_employee, False),
        (test_user_cro, False),
        (test_user_risk_manager, False),
        (test_user_compliance, False),
    )

    for user, expected_admin in cases:
        caps = build_admin_capabilities(user)
        assert caps.can_revoke_sessions is expected_admin
        assert caps.can_run_directory_check_all is expected_admin
        assert caps.can_update_log_config is expected_admin
        assert caps.can_export_loaded_audit_logs is expected_admin


@pytest.mark.asyncio
async def test_get_admin_console_capabilities_endpoint_admin_returns_true(
    client_factory,
    test_user_platform_admin: User,
) -> None:
    async with client_factory(current_user=test_user_platform_admin) as ac:
        resp = await ac.get("/api/v1/admin/capabilities")

    assert resp.status_code == 200
    body = resp.json()
    assert body["can_revoke_sessions"] is True


@pytest.mark.asyncio
async def test_get_admin_console_capabilities_endpoint_non_admin_blocked(
    client_factory,
    test_user_employee: User,
) -> None:
    async with client_factory(current_user=test_user_employee) as ac:
        resp = await ac.get("/api/v1/admin/capabilities")

    assert resp.status_code in (401, 403)
