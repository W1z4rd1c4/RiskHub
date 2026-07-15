"""sync CISO vendor-contract read permission for existing databases

The canonical RBAC seed grants the CISO read access to Vendor Contracts. The
historical Vendor Contract permission sync predates that role contract and
remains immutable, so this forward-only correction idempotently reconciles
deployed databases without removing any custom grants.

Revision ID: i0d1e2f3g4h5
Revises: h9c0d1e2f3g4
Create Date: 2026-07-15 21:15:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i0d1e2f3g4h5"
down_revision: Union[str, Sequence[str], None] = "h9c0d1e2f3g4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VENDOR_CONTRACT_READ_PERMISSION: dict[str, str] = {
    "resource": "vendor_contracts",
    "action": "read",
    "description": "View vendor contracts and DORA clauses",
}

ROLE_VENDOR_CONTRACT_GRANTS: dict[str, tuple[str, ...]] = {
    "ciso": ("vendor_contracts:read",),
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
        VENDOR_CONTRACT_READ_PERMISSION,
    )

    permission_id = conn.execute(
        sa.text(
            "SELECT id FROM permissions " "WHERE resource = :resource AND action = :action " "ORDER BY id ASC LIMIT 1"
        ),
        {
            "resource": VENDOR_CONTRACT_READ_PERMISSION["resource"],
            "action": VENDOR_CONTRACT_READ_PERMISSION["action"],
        },
    ).scalar()
    if permission_id is None:
        raise RuntimeError("Failed to ensure permission vendor_contracts:read")

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
