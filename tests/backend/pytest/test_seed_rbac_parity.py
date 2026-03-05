"""Guardrails to keep RBAC seeds aligned across app and demo scripts."""

from app.db import seed as app_seed
from app.db.rbac_seed_contract import (
    RBAC_PERMISSIONS,
    RBAC_ROLE_PERMISSIONS,
    RBAC_ROLES,
    expand_permission_keys,
)
from scripts import seed_demo
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
