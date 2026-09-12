"""Persist exact native bootstrap principals and irreversible enrollment completion.

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
"""
from alembic import op
import sqlalchemy as sa

revision = "w2x3y4z5a6b7"
down_revision = "v1w2x3y4z5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "local_bootstrap_targets",
        sa.Column("installation_id", sa.String(), sa.ForeignKey("installation_identity.installation_id"), primary_key=True),
        sa.Column("slot", sa.String(8), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("initial_email", sa.String(255), nullable=False),
        sa.Column("delivery_id", sa.String(32), sa.ForeignKey("local_auth_deliveries.id"), nullable=False),
        sa.Column("handoff_path", sa.Text(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("slot IN ('admin', 'cro')", name="ck_local_bootstrap_slot"),
    )


def downgrade() -> None:
    raise RuntimeError("Forward-only identity migration; never discard completed bootstrap evidence")
