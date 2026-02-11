"""Add issue remediation management tables and activity entity types.

Revision ID: 13a1b2c3d4e5
Revises: 18c1d2e3f4b4
Create Date: 2026-02-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "13a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "18c1d2e3f4b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    issue_severity = sa.Enum(
        "low",
        "medium",
        "high",
        "critical",
        name="issue_severity",
        native_enum=False,
    )
    issue_status = sa.Enum(
        "open",
        "triaged",
        "in_progress",
        "ready_for_validation",
        "closed",
        name="issue_status",
        native_enum=False,
    )
    issue_source_type = sa.Enum(
        "manual",
        "control_execution",
        "kri_breach",
        "audit",
        name="issue_source_type",
        native_enum=False,
    )
    issue_remediation_status = sa.Enum(
        "draft",
        "active",
        "blocked",
        "completed",
        name="issue_remediation_status",
        native_enum=False,
    )
    issue_exception_status = sa.Enum(
        "requested",
        "approved",
        "revoked",
        "expired",
        name="issue_exception_status",
        native_enum=False,
    )

    op.create_table(
        "issues",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("severity", issue_severity, nullable=False, server_default="medium"),
        sa.Column("status", issue_status, nullable=False, server_default="open"),
        sa.Column("source_type", issue_source_type, nullable=False, server_default="manual"),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validation_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_due_soon_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_overdue_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_escalated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_issues_department_id", "issues", ["department_id"])
    op.create_index("ix_issues_owner_user_id", "issues", ["owner_user_id"])
    op.create_index("ix_issues_due_at", "issues", ["due_at"])
    op.create_index("ix_issues_status_severity", "issues", ["status", "severity"])
    op.create_index("ix_issues_department_status", "issues", ["department_id", "status"])
    op.create_index("ix_issues_owner_status", "issues", ["owner_user_id", "status"])
    op.create_index("ix_issues_due_status", "issues", ["due_at", "status"])

    op.create_table(
        "issue_links",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("issue_id", sa.Integer(), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("risk_id", sa.Integer(), sa.ForeignKey("risks.id"), nullable=True),
        sa.Column("control_id", sa.Integer(), sa.ForeignKey("controls.id"), nullable=True),
        sa.Column("execution_id", sa.Integer(), sa.ForeignKey("control_executions.id"), nullable=True),
        sa.Column("kri_id", sa.Integer(), sa.ForeignKey("key_risk_indicators.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "("
            "(CASE WHEN risk_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN control_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN execution_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN kri_id IS NOT NULL THEN 1 ELSE 0 END)"
            ") = 1",
            name="ck_issue_links_exactly_one_target",
        ),
    )
    op.create_index("ix_issue_links_issue_id", "issue_links", ["issue_id"])

    op.create_table(
        "issue_remediation_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("issue_id", sa.Integer(), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", issue_remediation_status, nullable=False, server_default="draft"),
        sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("target_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("blocker_reason", sa.Text(), nullable=True),
        sa.Column("completion_notes", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("progress_percent >= 0 AND progress_percent <= 100", name="ck_issue_remediation_progress_range"),
        sa.UniqueConstraint("issue_id", name="uq_issue_remediation_issue_id"),
    )
    op.create_index("ix_issue_remediation_plans_issue_id", "issue_remediation_plans", ["issue_id"])
    op.create_index("ix_issue_remediation_plans_owner_user_id", "issue_remediation_plans", ["owner_user_id"])
    op.create_index("ix_issue_remediation_status", "issue_remediation_plans", ["status"])
    op.create_index("ix_issue_remediation_owner", "issue_remediation_plans", ["owner_user_id"])

    op.create_table(
        "issue_exceptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("issue_id", sa.Integer(), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", issue_exception_status, nullable=False, server_default="requested"),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("requested_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_issue_exceptions_issue_id", "issue_exceptions", ["issue_id"])
    op.create_index("ix_issue_exceptions_requested_by_id", "issue_exceptions", ["requested_by_id"])
    op.create_index("ix_issue_exceptions_approved_by_id", "issue_exceptions", ["approved_by_id"])
    op.create_index("ix_issue_exceptions_expires_at", "issue_exceptions", ["expires_at"])

    # Extend activity log entity_type enum/check values.
    activity_entity_enum = sa.Enum(
        "risk",
        "control",
        "kri",
        "risk_questionnaire",
        "vendor",
        "vendor_assessment",
        "vendor_incident",
        "vendor_sla",
        "vendor_remediation",
        "issue",
        "issue_remediation",
        "issue_exception",
        "user",
        "department",
        "approval",
        "control_execution",
        "kri_value",
        "control_risk_link",
        "role",
        "config",
        name="activity_entity_type",
        native_enum=False,
    )
    with op.batch_alter_table("activity_logs", schema=None) as batch_op:
        batch_op.alter_column(
            "entity_type",
            existing_type=sa.Enum(name="activity_entity_type", native_enum=False),
            type_=activity_entity_enum,
            existing_nullable=False,
        )


def downgrade() -> None:
    op.drop_index("ix_issue_exceptions_expires_at", table_name="issue_exceptions")
    op.drop_index("ix_issue_exceptions_approved_by_id", table_name="issue_exceptions")
    op.drop_index("ix_issue_exceptions_requested_by_id", table_name="issue_exceptions")
    op.drop_index("ix_issue_exceptions_issue_id", table_name="issue_exceptions")
    op.drop_table("issue_exceptions")

    op.drop_index("ix_issue_remediation_owner", table_name="issue_remediation_plans")
    op.drop_index("ix_issue_remediation_status", table_name="issue_remediation_plans")
    op.drop_index("ix_issue_remediation_plans_owner_user_id", table_name="issue_remediation_plans")
    op.drop_index("ix_issue_remediation_plans_issue_id", table_name="issue_remediation_plans")
    op.drop_table("issue_remediation_plans")

    op.drop_index("ix_issue_links_issue_id", table_name="issue_links")
    op.drop_table("issue_links")

    op.drop_index("ix_issues_due_status", table_name="issues")
    op.drop_index("ix_issues_owner_status", table_name="issues")
    op.drop_index("ix_issues_department_status", table_name="issues")
    op.drop_index("ix_issues_status_severity", table_name="issues")
    op.drop_index("ix_issues_due_at", table_name="issues")
    op.drop_index("ix_issues_owner_user_id", table_name="issues")
    op.drop_index("ix_issues_department_id", table_name="issues")
    op.drop_table("issues")

