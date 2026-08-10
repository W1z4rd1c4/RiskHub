"""sync threat permissions for existing databases

ICT Register Threat register (issue #47): existing databases were seeded
before the `threats` resource existed, and the startup seed only populates
empty databases. Following the repo convention shipped with every new
resource (13d4e5f6a7b8 for issues, 18c1d2e3f4a6/18c1d2e3f4a7 for vendors,
q4r5s6t7u8v9 for processes, s6t7u8v9w0x1 for assets), this data migration
idempotently ensures the `threats` permission rows exist and grants them to
the default roles exactly as ``app/db/rbac_seed_contract.py`` declares:
risk_manager holds ``threats:*`` and every role holding ``vendors:read``
gains ``threats:read``. The CRO wildcard row is re-ensured and CRO
additionally receives explicit threat rows (the 18c1d2e3f4a7 precedent).
Existing custom grants are never removed.

Revision ID: z1a2b3c4d5e6
Revises: y1z2a3b4c5d6
Create Date: 2026-07-10 09:45:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "z1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "y1z2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Verbatim seed-contract rows (app/db/rbac_seed_contract.py RBAC_PERMISSIONS);
# kept in parity by tests/backend/pytest/test_ict_register_threats.py.
THREAT_PERMISSIONS: tuple[dict[str, str], ...] = (
    {"resource": "threats", "action": "read", "description": "View ICT Register threats"},
    {"resource": "threats", "action": "write", "description": "Create/edit ICT Register threats"},
    {"resource": "threats", "action": "delete", "description": "Archive/restore ICT Register threats"},
)

# Mirrors RBAC_ROLE_PERMISSIONS: risk_manager expands threats:*; the read
# grant follows the vendors:read holders. The platform admin role stays
# excluded from business data; CRO is handled via the wildcard below.
ROLE_THREAT_GRANTS: dict[str, tuple[str, ...]] = {
    "risk_manager": ("threats:read", "threats:write", "threats:delete"),
    "actuarial": ("threats:read",),
    "compliance": ("threats:read",),
    "internal_audit": ("threats:read",),
    "department_head": ("threats:read",),
    "employee": ("threats:read",),
    "viewer": ("threats:read",),
}


def upgrade() -> None:
    conn = op.get_bind()

    def ensure_permission(*, resource: str, action: str, description: str) -> int:
        existing = conn.execute(
            sa.text(
                "SELECT id FROM permissions WHERE resource = :resource AND action = :action ORDER BY id ASC LIMIT 1"
            ),
            {"resource": resource, "action": action},
        ).scalar()
        if existing is not None:
            return int(existing)

        conn.execute(
            sa.text(
                "INSERT INTO permissions (resource, action, description) "
                "SELECT :resource, :action, :description "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE resource = :resource AND action = :action)"
            ),
            {"resource": resource, "action": action, "description": description},
        )
        created = conn.execute(
            sa.text(
                "SELECT id FROM permissions WHERE resource = :resource AND action = :action ORDER BY id ASC LIMIT 1"
            ),
            {"resource": resource, "action": action},
        ).scalar()
        if created is None:
            raise RuntimeError(f"Failed to ensure permission {resource}:{action}")
        return int(created)

    def get_role_id(role_name: str) -> int | None:
        role_id = conn.execute(
            sa.text("SELECT id FROM roles WHERE name = :name ORDER BY id ASC LIMIT 1"),
            {"name": role_name},
        ).scalar()
        return int(role_id) if role_id is not None else None

    def ensure_role_permission(*, role_id: int, permission_id: int) -> None:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT :role_id, :permission_id "
                "WHERE NOT EXISTS ("
                "  SELECT 1 FROM role_permissions WHERE role_id = :role_id AND permission_id = :permission_id"
                ")"
            ),
            {"role_id": role_id, "permission_id": permission_id},
        )

    # Ensure the threat permission rows exist (idempotent).
    permission_ids_by_key: dict[str, int] = {}
    for permission in THREAT_PERMISSIONS:
        key = f"{permission['resource']}:{permission['action']}"
        permission_ids_by_key[key] = ensure_permission(
            resource=permission["resource"],
            action=permission["action"],
            description=permission["description"],
        )

    # Ensure CRO keeps wildcard access on already-seeded databases and grant
    # the explicit threat rows as well (18c1d2e3f4a6/18c1d2e3f4a7 precedent).
    perm_all = ensure_permission(resource="*", action="*", description="Full access to all resources")
    cro_role_id = get_role_id("cro")
    if cro_role_id is not None:
        ensure_role_permission(role_id=cro_role_id, permission_id=perm_all)
        for permission_id in permission_ids_by_key.values():
            ensure_role_permission(role_id=cro_role_id, permission_id=permission_id)

    # Grant to default roles per the seed contract (idempotent; never removes
    # existing custom grants).
    for role_name, permission_keys in ROLE_THREAT_GRANTS.items():
        role_id = get_role_id(role_name)
        if role_id is None:
            continue
        for permission_key in permission_keys:
            ensure_role_permission(role_id=role_id, permission_id=permission_ids_by_key[permission_key])


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
