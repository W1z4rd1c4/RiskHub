"""add vendor exit and bcp artifacts

Revision ID: 18c1d2e3f4b1
Revises: 18c1d2e3f4b0
Create Date: 2026-01-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18c1d2e3f4b1"
down_revision: Union[str, Sequence[str], None] = "18c1d2e3f4b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_exit_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="not_started"),
        sa.Column("plan_reference", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("vendor_id", name="uq_vendor_exit_plans_vendor_id"),
    )
    op.create_index("ix_vendor_exit_plans_vendor_id", "vendor_exit_plans", ["vendor_id"])

    op.create_table(
        "vendor_contingency_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("max_tolerable_outage_hours", sa.Integer(), nullable=True),
        sa.Column("impact_confidentiality", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("impact_integrity", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("impact_authenticity", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("impact_availability", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="not_started"),
        sa.Column("plan_reference", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("vendor_id", name="uq_vendor_contingency_plans_vendor_id"),
    )
    op.create_index("ix_vendor_contingency_plans_vendor_id", "vendor_contingency_plans", ["vendor_id"])


def downgrade() -> None:
    op.drop_index("ix_vendor_contingency_plans_vendor_id", table_name="vendor_contingency_plans")
    op.drop_table("vendor_contingency_plans")
    op.drop_index("ix_vendor_exit_plans_vendor_id", table_name="vendor_exit_plans")
    op.drop_table("vendor_exit_plans")

