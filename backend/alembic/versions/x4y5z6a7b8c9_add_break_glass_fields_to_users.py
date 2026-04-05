"""add break-glass fields to users

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b
Create Date: 2026-04-05 16:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "x4y5z6a7b8c9"
down_revision: str | None = "w3x4y5z6a7b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("break_glass_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("break_glass_reason", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("break_glass_granted_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_users_break_glass_granted_by_user_id_users"),
        "users",
        "users",
        ["break_glass_granted_by_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_users_break_glass_granted_by_user_id_users"), "users", type_="foreignkey")
    op.drop_column("users", "break_glass_granted_by_user_id")
    op.drop_column("users", "break_glass_reason")
    op.drop_column("users", "break_glass_expires_at")
