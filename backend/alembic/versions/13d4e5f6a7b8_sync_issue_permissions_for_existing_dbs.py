"""sync issue permissions for existing databases

Revision ID: 13d4e5f6a7b8
Revises: 13c2d3e4f5a7
Create Date: 2026-02-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "13d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "13c2d3e4f5a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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

    issue_read = ensure_permission(resource="issues", action="read", description="View issues/findings")
    issue_write = ensure_permission(resource="issues", action="write", description="Create/edit issues/findings")
    issue_approve = ensure_permission(resource="issues", action="approve", description="Approve issue exceptions")

    role_permission_map: dict[str, list[int]] = {
        "risk_manager": [issue_read, issue_write, issue_approve],
        "department_head": [issue_read, issue_write],
        "compliance": [issue_read],
        "internal_audit": [issue_read],
    }

    for role_name, permission_ids in role_permission_map.items():
        role_id = get_role_id(role_name)
        if role_id is None:
            continue
        for permission_id in permission_ids:
            ensure_role_permission(role_id=role_id, permission_id=permission_id)


def downgrade() -> None:
    # Non-destructive data migration.
    pass
