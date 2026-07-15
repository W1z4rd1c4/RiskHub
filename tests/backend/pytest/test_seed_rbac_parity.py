"""Guardrails to keep RBAC seeds aligned across app and demo scripts."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import seed as app_seed
from app.db.rbac_seed_contract import (
    RBAC_PERMISSIONS,
    RBAC_ROLE_PERMISSIONS,
    RBAC_ROLES,
    expand_permission_keys,
)
from app.models import Department, RolePermission, User
from app.models import Role as RoleModel
from app.models.user import AccessScope
from scripts import e2e_mappings, seed_demo
from scripts.add_granular_permissions import TARGET_PERMISSIONS


def test_app_seed_uses_canonical_rbac_contract() -> None:
    assert tuple(app_seed.ROLES) == RBAC_ROLES
    assert tuple(app_seed.PERMISSIONS) == RBAC_PERMISSIONS
    assert app_seed.ROLE_PERMISSIONS == RBAC_ROLE_PERMISSIONS


def test_demo_seed_role_permissions_match_canonical_contract() -> None:
    for role_name, demo_permission_keys in seed_demo.ROLE_PERMISSIONS.items():
        canonical_permission_keys = RBAC_ROLE_PERMISSIONS[role_name]
        assert set(demo_permission_keys) == set(canonical_permission_keys)

        demo_expanded = expand_permission_keys(demo_permission_keys)
        canonical_expanded = expand_permission_keys(canonical_permission_keys)
        assert demo_expanded == canonical_expanded


def test_ciso_persona_is_a_required_e2e_mapping() -> None:
    assert "ciso@riskhub.local" in e2e_mappings.REQUIRED_USER_EMAILS


def test_controls_execute_contract_and_convergence_mapping() -> None:
    permission_keys = {f"{permission['resource']}:{permission['action']}" for permission in RBAC_PERMISSIONS}
    assert "controls:execute" in permission_keys

    roles_with_controls_execute = {
        role_name
        for role_name, permission_keys in RBAC_ROLE_PERMISSIONS.items()
        if "controls:execute" in expand_permission_keys(permission_keys)
    }
    assert roles_with_controls_execute == {
        "cro",
        "risk_manager",
        "compliance",
        "internal_audit",
        "actuarial",
        "department_head",
        "employee",
    }

    assert set(TARGET_PERMISSIONS["controls:execute"]["roles_to_grant"]) == roles_with_controls_execute
    assert "admin" not in roles_with_controls_execute


@pytest.mark.asyncio
async def test_demo_seed_reconciles_new_ciso_persona_idempotently(
    db_session: AsyncSession,
) -> None:
    ciso_role = RoleModel(name="ciso", display_name="Chief Information Security Officer")
    it_department = Department(name="Information Technology", code="IT")
    db_session.add_all([ciso_role, it_department])
    await db_session.flush()
    ciso_row = next(row for row in app_seed.TEST_USERS if row["email"] == "ciso@riskhub.local")

    assert await app_seed.seed_missing_demo_users(db_session, [ciso_row]) == 1
    assert await app_seed.seed_missing_demo_users(db_session, [ciso_row]) == 0

    ciso = (
        await db_session.execute(select(User).where(User.email == "ciso@riskhub.local"))
    ).scalar_one()
    assert ciso.role_id == ciso_role.id
    assert ciso.department_id == it_department.id
    assert ciso.access_scope == AccessScope.GLOBAL
    assert ciso.is_active is True


@pytest.mark.asyncio
async def test_shared_employee_fixture_matches_canonical_seed_contract(
    db_session: AsyncSession,
    test_role_employee: RoleModel,
) -> None:
    result = await db_session.execute(
        select(RoleModel)
        .options(selectinload(RoleModel.permissions).selectinload(RolePermission.permission))
        .where(RoleModel.id == test_role_employee.id)
    )
    role = result.scalar_one()
    fixture_permission_keys = {
        f"{role_permission.permission.resource}:{role_permission.permission.action}"
        for role_permission in role.permissions
    }
    assert fixture_permission_keys == expand_permission_keys(RBAC_ROLE_PERMISSIONS["employee"])
