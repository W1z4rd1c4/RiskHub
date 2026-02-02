"""add vendor incidents, remediation, and slas

Revision ID: 18c1d2e3f4b3
Revises: 18c1d2e3f4b2
Create Date: 2026-01-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18c1d2e3f4b3"
down_revision: Union[str, Sequence[str], None] = "18c1d2e3f4b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_incidents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("incident_type", sa.String(length=50), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("is_major", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.String(length=500), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_vendor_incidents_vendor_id", "vendor_incidents", ["vendor_id"])
    op.create_index("ix_vendor_incidents_vendor_major", "vendor_incidents", ["vendor_id", "is_major"])

    op.create_table(
        "vendor_remediation_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("vendor_incidents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_vendor_remediation_actions_vendor_id", "vendor_remediation_actions", ["vendor_id"])
    op.create_index("ix_vendor_remediation_actions_incident_id", "vendor_remediation_actions", ["incident_id"])
    op.create_index("ix_vendor_remediation_actions_owner_user_id", "vendor_remediation_actions", ["owner_user_id"])

    op.create_table(
        "vendor_slas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("metric_name", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("current_value", sa.Float(), nullable=False),
        sa.Column("lower_limit", sa.Float(), nullable=False),
        sa.Column("upper_limit", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=50), nullable=False, server_default="%"),
        sa.Column("frequency", sa.String(length=20), nullable=False, server_default="monthly"),
        sa.Column("reporting_owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("last_period_end", sa.Date(), nullable=True),
        sa.Column("last_reported_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_updated", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_vendor_slas_vendor_id", "vendor_slas", ["vendor_id"])
    op.create_index("ix_vendor_slas_reporting_owner_id", "vendor_slas", ["reporting_owner_id"])
    op.create_index("ix_vendor_slas_is_archived", "vendor_slas", ["is_archived"])

    op.create_table(
        "vendor_sla_value_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("sla_id", sa.Integer(), sa.ForeignKey("vendor_slas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("lower_limit", sa.Float(), nullable=False),
        sa.Column("upper_limit", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=50), nullable=False),
        sa.Column("breach_status", sa.String(length=20), nullable=False),
    )
    op.create_index("ix_vendor_sla_value_history_sla_id", "vendor_sla_value_history", ["sla_id"])


def downgrade() -> None:
    op.drop_index("ix_vendor_sla_value_history_sla_id", table_name="vendor_sla_value_history")
    op.drop_table("vendor_sla_value_history")
    op.drop_index("ix_vendor_slas_is_archived", table_name="vendor_slas")
    op.drop_index("ix_vendor_slas_reporting_owner_id", table_name="vendor_slas")
    op.drop_index("ix_vendor_slas_vendor_id", table_name="vendor_slas")
    op.drop_table("vendor_slas")
    op.drop_index("ix_vendor_remediation_actions_owner_user_id", table_name="vendor_remediation_actions")
    op.drop_index("ix_vendor_remediation_actions_incident_id", table_name="vendor_remediation_actions")
    op.drop_index("ix_vendor_remediation_actions_vendor_id", table_name="vendor_remediation_actions")
    op.drop_table("vendor_remediation_actions")
    op.drop_index("ix_vendor_incidents_vendor_major", table_name="vendor_incidents")
    op.drop_index("ix_vendor_incidents_vendor_id", table_name="vendor_incidents")
    op.drop_table("vendor_incidents")

