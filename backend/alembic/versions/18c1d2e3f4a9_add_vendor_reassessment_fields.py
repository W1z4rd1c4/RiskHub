"""add vendor reassessment fields

Revision ID: 18c1d2e3f4a9
Revises: 18c1d2e3f4a8
Create Date: 2026-01-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18c1d2e3f4a9"
down_revision: Union[str, Sequence[str], None] = "18c1d2e3f4a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("vendors") as batch_op:
        batch_op.add_column(sa.Column("reassessment_cadence_months", sa.Integer(), nullable=False, server_default="36"))
        batch_op.add_column(sa.Column("next_reassessment_due_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_assessed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_decided_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_reassessment_reminded_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("reassessment_triggered_reason", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("reassessment_triggered_at", sa.DateTime(timezone=True), nullable=True))

    op.create_index("ix_vendors_next_reassessment_due_at", "vendors", ["next_reassessment_due_at"])


def downgrade() -> None:
    op.drop_index("ix_vendors_next_reassessment_due_at", table_name="vendors")
    with op.batch_alter_table("vendors") as batch_op:
        batch_op.drop_column("reassessment_triggered_at")
        batch_op.drop_column("reassessment_triggered_reason")
        batch_op.drop_column("last_reassessment_reminded_at")
        batch_op.drop_column("last_decided_at")
        batch_op.drop_column("last_assessed_at")
        batch_op.drop_column("next_reassessment_due_at")
        batch_op.drop_column("reassessment_cadence_months")

