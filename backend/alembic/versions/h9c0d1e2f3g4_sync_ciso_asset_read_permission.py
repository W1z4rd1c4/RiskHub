"""sync CISO asset read permission for existing databases

The canonical RBAC seed grants the CISO read access to ICT Register Assets.
The historical Asset permission sync predates that role contract and remains
immutable, so this forward-only correction idempotently reconciles deployed
databases without removing any custom grants.

Revision ID: h9c0d1e2f3g4
Revises: g8b9c0d1e2f3
Create Date: 2026-07-15 20:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h9c0d1e2f3g4"
down_revision: Union[str, Sequence[str], None] = "g8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ASSET_READ_PERMISSION: dict[str, str] = {
    "resource": "assets",
    "action": "read",
    "description": "View ICT Register assets",
}

ROLE_ASSET_GRANTS: dict[str, tuple[str, ...]] = {
    "ciso": ("assets:read",),
}


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO permissions (resource, action, description) "
            "SELECT :resource, :action, :description "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM permissions "
            "  WHERE resource = :resource AND action = :action"
            ")"
        ),
        ASSET_READ_PERMISSION,
    )

    permission_id = conn.execute(
        sa.text(
            "SELECT id FROM permissions " "WHERE resource = :resource AND action = :action " "ORDER BY id ASC LIMIT 1"
        ),
        {
            "resource": ASSET_READ_PERMISSION["resource"],
            "action": ASSET_READ_PERMISSION["action"],
        },
    ).scalar()
    if permission_id is None:
        raise RuntimeError("Failed to ensure permission assets:read")

    ciso_role_id = conn.execute(sa.text("SELECT id FROM roles WHERE name = 'ciso' ORDER BY id ASC LIMIT 1")).scalar()
    if ciso_role_id is None:
        return

    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT :role_id, :permission_id "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM role_permissions "
            "  WHERE role_id = :role_id AND permission_id = :permission_id"
            ")"
        ),
        {"role_id": int(ciso_role_id), "permission_id": int(permission_id)},
    )


def downgrade() -> None:
    """Forward-only migration. Restore from snapshot per ADR-010."""
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
