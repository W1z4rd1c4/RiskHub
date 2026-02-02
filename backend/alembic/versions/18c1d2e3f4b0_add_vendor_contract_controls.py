"""add vendor contract controls

Revision ID: 18c1d2e3f4b0
Revises: 18c1d2e3f4a9
Create Date: 2026-01-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18c1d2e3f4b0"
down_revision: Union[str, Sequence[str], None] = "18c1d2e3f4a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_contract_controls",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("control_key", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="missing"),
        sa.Column("evidence_reference", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("vendor_id", "control_key", name="uq_vendor_contract_controls_vendor_key"),
    )
    op.create_index("ix_vendor_contract_controls_vendor_id", "vendor_contract_controls", ["vendor_id"])
    op.create_index("ix_vendor_contract_controls_control_key", "vendor_contract_controls", ["control_key"])
    op.create_index("ix_vendor_contract_controls_vendor_key", "vendor_contract_controls", ["vendor_id", "control_key"])


def downgrade() -> None:
    op.drop_index("ix_vendor_contract_controls_vendor_key", table_name="vendor_contract_controls")
    op.drop_index("ix_vendor_contract_controls_control_key", table_name="vendor_contract_controls")
    op.drop_index("ix_vendor_contract_controls_vendor_id", table_name="vendor_contract_controls")
    op.drop_table("vendor_contract_controls")

