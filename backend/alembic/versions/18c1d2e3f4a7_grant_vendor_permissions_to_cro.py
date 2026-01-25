"""grant vendor permissions to CRO explicitly

Revision ID: 18c1d2e3f4a7
Revises: 18c1d2e3f4a6
Create Date: 2026-01-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18c1d2e3f4a7"
down_revision: Union[str, Sequence[str], None] = "18c1d2e3f4a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    def get_permission_id(resource: str, action: str) -> int | None:
        pid = conn.execute(
            sa.text(
                "SELECT id FROM permissions WHERE resource = :resource AND action = :action ORDER BY id ASC LIMIT 1"
            ),
            {"resource": resource, "action": action},
        ).scalar()
        return int(pid) if pid is not None else None

    role_id = conn.execute(
        sa.text("SELECT id FROM roles WHERE name = 'cro' ORDER BY id ASC LIMIT 1")
    ).scalar()
    if role_id is None:
        return
    role_id = int(role_id)

    permission_ids: list[int] = []
    for resource, action in [
        ("vendors", "read"),
        ("vendors", "write"),
        ("vendors", "delete"),
        ("vendor_contracts", "read"),
        ("vendor_contracts", "write"),
    ]:
        pid = get_permission_id(resource, action)
        if pid is not None:
            permission_ids.append(pid)

    for pid in permission_ids:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT :role_id, :permission_id "
                "WHERE NOT EXISTS ("
                "  SELECT 1 FROM role_permissions WHERE role_id = :role_id AND permission_id = :permission_id"
                ")"
            ),
            {"role_id": role_id, "permission_id": pid},
        )


def downgrade() -> None:
    # Non-destructive; no downgrade.
    pass

