from __future__ import annotations

import pytest

from app.db.rbac_seed_contract import RBAC_PERMISSIONS, RBAC_ROLE_PERMISSIONS, expand_permission_keys

pytestmark = pytest.mark.contract


def test_admin_session_revoke_is_seeded_for_admin_role() -> None:
    permission_keys = {
        f"{permission['resource']}:{permission['action']}" for permission in RBAC_PERMISSIONS
    }

    assert "admin:session.revoke" in permission_keys
    assert "admin:session.revoke" in expand_permission_keys(RBAC_ROLE_PERMISSIONS["admin"])
