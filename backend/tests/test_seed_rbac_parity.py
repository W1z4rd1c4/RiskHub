"""Guardrails to keep RBAC seeds aligned across app and demo scripts."""

from app.db import seed as app_seed
from app.db.rbac_seed_contract import (
    RBAC_PERMISSIONS,
    RBAC_ROLES,
    RBAC_ROLE_PERMISSIONS,
    expand_permission_keys,
)
from scripts import seed_demo


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
