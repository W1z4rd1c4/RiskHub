"""add vendor assessments

Revision ID: 18c1d2e3f4a8
Revises: 18c1d2e3f4a7
Create Date: 2026-01-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18c1d2e3f4a8"
down_revision: Union[str, Sequence[str], None] = "18c1d2e3f4a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_assessments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("template_key", sa.String(length=100), nullable=False),
        sa.Column("template_version", sa.String(length=20), nullable=False),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column("answers_json", sa.JSON(), nullable=True),
        sa.Column("evidence_reference", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("decided_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("committee_recommendation", sa.String(length=50), nullable=True),
        sa.Column("conditions_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_vendor_assessments_vendor_id", "vendor_assessments", ["vendor_id"])
    op.create_index("ix_vendor_assessments_status", "vendor_assessments", ["status"])
    op.create_index("ix_vendor_assessments_vendor_status", "vendor_assessments", ["vendor_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_vendor_assessments_vendor_status", table_name="vendor_assessments")
    op.drop_index("ix_vendor_assessments_status", table_name="vendor_assessments")
    op.drop_index("ix_vendor_assessments_vendor_id", table_name="vendor_assessments")
    op.drop_table("vendor_assessments")
