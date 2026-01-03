"""add_access_scope_to_users

Revision ID: d91a5e7c3b12
Revises: c2d4f6g8h0j2
Create Date: 2025-12-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d91a5e7c3b12"
down_revision: Union[str, Sequence[str], None] = "c2d4f6g8h0j2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    access_scope_enum = sa.Enum(
        "global", "department", "manager",
        name="access_scope",
        create_type=True,
    )
    access_scope_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "users",
        sa.Column(
            "access_scope",
            sa.Enum("global", "department", "manager", name="access_scope", create_constraint=True),
            nullable=False,
            server_default="department",
        ),
    )

    op.execute(
        """
        UPDATE users
        SET access_scope = 'global'
        WHERE role_id IN (
            SELECT id FROM roles
            WHERE name IN (
                'admin', 'cro', 'risk_manager', 'compliance', 'legal',
                'internal_audit', 'actuarial', 'ceo', 'cfo'
            )
        )
        """
    )

    op.execute(
        """
        UPDATE users
        SET access_scope = 'manager'
        WHERE access_scope = 'department'
          AND department_id IS NULL
          AND manager_id IS NOT NULL
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "access_scope")
    access_scope_enum = sa.Enum("global", "department", "manager", name="access_scope")
    access_scope_enum.drop(op.get_bind(), checkfirst=True)
