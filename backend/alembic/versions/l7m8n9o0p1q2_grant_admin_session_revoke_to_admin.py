"""Grant admin session revoke permission to admin role.

Revision ID: l7m8n9o0p1q2
Revises: k6l7m8n9o0p1
Create Date: 2026-05-16

Forward-only per ADR-010.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "l7m8n9o0p1q2"
down_revision: Union[str, Sequence[str], None] = "k6l7m8n9o0p1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO permissions (resource, action, description)
        SELECT 'admin', 'session.revoke', 'Revoke user sessions'
        WHERE NOT EXISTS (
            SELECT 1 FROM permissions WHERE resource = 'admin' AND action = 'session.revoke'
        )
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        JOIN permissions p ON p.resource = 'admin' AND p.action = 'session.revoke'
        WHERE r.name = 'admin'
          AND NOT EXISTS (
              SELECT 1
              FROM role_permissions rp
              WHERE rp.role_id = r.id AND rp.permission_id = p.id
          )
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
