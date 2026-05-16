from __future__ import annotations

import json
import tomllib
from pathlib import Path

import pytest

from app.models import Permission, Role, RolePermission, User
from app.models.role import RoleType
from app.models.user import AccessScope
from app.services._authorization_capabilities.me import build_me_capabilities

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CONTRACT_JSON = REPO_ROOT / "docs/security/authorization-capability-contract.json"
BASELINE_PATH = REPO_ROOT / "tests/backend/pytest/architecture/_w12_resource_permissions_baseline.toml"
EXPECTED_KEYS_KEY = "expected_keys"
EXPECTED_KEYS = set(tomllib.loads(BASELINE_PATH.read_text(encoding="utf-8"))[EXPECTED_KEYS_KEY])


def _user_with_all_route_permissions() -> User:
    role = Role(id=1, name=RoleType.RISK_MANAGER.value, display_name="Risk Manager")
    role.permissions = [
        RolePermission(
            permission=Permission(resource=resource, action=action, description=f"{resource}:{action}")
        )
        for resource, action in (
            ("risks", "read"),
            ("controls", "read"),
            ("issues", "read"),
            ("vendors", "read"),
            ("departments", "read"),
            ("users", "read"),
            ("users", "write"),
            ("activity_log", "read"),
        )
    ]
    return User(
        id=1,
        email="risk.manager@example.com",
        name="Risk Manager",
        role=role,
        role_id=role.id,
        access_scope=AccessScope.GLOBAL,
    )


def test_runtime_resource_permission_keys_are_documented_by_capability_contract() -> None:
    capabilities = build_me_capabilities(_user_with_all_route_permissions())
    runtime_keys = set(capabilities.resource_permissions)

    contract = json.loads(CONTRACT_JSON.read_text(encoding="utf-8"))
    documented_action_ids = {
        key: [
            action["id"]
            for action in contract["actions"]
            if key in json.dumps(action, sort_keys=True)
        ]
        for key in runtime_keys
    }

    assert runtime_keys == EXPECTED_KEYS, (
        f"expected resource permission keys per {BASELINE_PATH}::{EXPECTED_KEYS_KEY}; "
        f"found {sorted(runtime_keys)}"
    )
    assert {key: ids for key, ids in documented_action_ids.items() if not ids} == {}
    for ids in documented_action_ids.values():
        assert all(action_id.startswith("AUTHZ-") for action_id in ids)
