"""remove vendor extended domains and reassessment fields

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-03-08 18:20:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "u1v2w3x4y5z6"
down_revision: Union[str, Sequence[str], None] = "t0u1v2w3x4y5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("vendors") as batch_op:
        batch_op.drop_index("ix_vendors_next_reassessment_due_at")
        batch_op.drop_column("reassessment_cadence_months")
        batch_op.drop_column("next_reassessment_due_at")
        batch_op.drop_column("last_assessed_at")
        batch_op.drop_column("last_decided_at")
        batch_op.drop_column("last_reassessment_reminded_at")
        batch_op.drop_column("reassessment_triggered_reason")
        batch_op.drop_column("reassessment_triggered_at")

    op.drop_table("vendor_assessments")
    op.drop_table("vendor_contract_controls")
    op.drop_table("vendor_exit_plans")
    op.drop_table("vendor_contingency_plans")
    op.drop_table("vendor_dependencies")
    op.drop_table("vendor_relationships")
    op.drop_table("vendor_services")
    op.drop_table("vendor_external_signals")
    op.drop_table("vendor_remediation_actions")
    op.drop_table("vendor_incidents")
    op.drop_table("vendor_sla_value_history")
    op.drop_table("vendor_slas")
    op.drop_table("vendor_risk_factors")


def downgrade() -> None:
    """Downgrade schema."""
    raise NotImplementedError("This migration is forward-only.")
