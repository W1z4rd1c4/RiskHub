"""Preserve restore quarantine and security cutover evidence.

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
"""
from alembic import op
import sqlalchemy as sa

revision = "x3y4z5a6b7c8"
down_revision = "w2x3y4z5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("restore_quarantined", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "identity_restore_cutover",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("installation_id", sa.String(36), sa.ForeignKey("installation_identity.installation_id"), nullable=False),
        sa.Column("epoch", sa.String(36), nullable=False),
        sa.Column("signing_fingerprint", sa.String(64), nullable=False),
        sa.Column("manifest_digest", sa.String(64), nullable=False),
        sa.Column("checkpoint_digest", sa.String(64), nullable=True),
        sa.Column("cutover_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_identity_restore_singleton"),
    )


def downgrade() -> None:
    raise RuntimeError("Forward-only restore security migration; never discard quarantine or signing cutover evidence")
