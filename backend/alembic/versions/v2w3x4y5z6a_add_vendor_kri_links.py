"""add vendor KRI links

Revision ID: v2w3x4y5z6a
Revises: u1v2w3x4y5z6
Create Date: 2026-03-09 14:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v2w3x4y5z6a"
down_revision: Union[str, Sequence[str], None] = "u1v2w3x4y5z6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_kri_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("kri_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["kri_id"], ["key_risk_indicators.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vendor_id", "kri_id", name="uq_vendor_kri_link"),
    )
    op.create_index(op.f("ix_vendor_kri_links_vendor_id"), "vendor_kri_links", ["vendor_id"], unique=False)
    op.create_index(op.f("ix_vendor_kri_links_kri_id"), "vendor_kri_links", ["kri_id"], unique=False)


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
