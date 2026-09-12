"""Keep recovering native accounts outside ordinary authentication.

Revision ID: v1w2x3y4z5a6
Revises: u0v1w2x3y4z5
"""
from alembic import op
import sqlalchemy as sa

revision = "v1w2x3y4z5a6"
down_revision = "u0v1w2x3y4z5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("local_recovery_pending", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    raise RuntimeError("Forward-only identity migration; retain recovery denial and roll forward")
