"""add risk questionnaires

Revision ID: a14b0c9d1e2f
Revises: d8f51bcdc6a2
Create Date: 2026-01-24

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a14b0c9d1e2f"
down_revision: Union[str, Sequence[str], None] = "d8f51bcdc6a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    questionnaire_status = sa.Enum(
        "sent",
        "in_progress",
        "submitted",
        name="risk_questionnaire_status",
        native_enum=False,
        create_constraint=True,
    )

    op.create_table(
        "risk_questionnaires",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("risk_id", sa.Integer(), nullable=False),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=False),
        sa.Column("sent_by_user_id", sa.Integer(), nullable=False),
        sa.Column("status", questionnaire_status, nullable=False),
        sa.Column("template_key", sa.String(length=100), nullable=False),
        sa.Column("template_version", sa.String(length=20), nullable=False),
        sa.Column("answers", sa.JSON(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["risk_id"], ["risks.id"]),
        sa.ForeignKeyConstraint(["sent_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_risk_questionnaires_risk_id"), "risk_questionnaires", ["risk_id"], unique=False)
    op.create_index(
        op.f("ix_risk_questionnaires_assigned_to_user_id"),
        "risk_questionnaires",
        ["assigned_to_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_risk_questionnaires_status"), "risk_questionnaires", ["status"], unique=False)

    op.create_index("ix_risk_questionnaires_risk_status", "risk_questionnaires", ["risk_id", "status"], unique=False)
    op.create_index(
        "ix_risk_questionnaires_assignee_status",
        "risk_questionnaires",
        ["assigned_to_user_id", "status"],
        unique=False,
    )
    op.create_index("ix_risk_questionnaires_due_status", "risk_questionnaires", ["due_at", "status"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_risk_questionnaires_due_status", table_name="risk_questionnaires")
    op.drop_index("ix_risk_questionnaires_assignee_status", table_name="risk_questionnaires")
    op.drop_index("ix_risk_questionnaires_risk_status", table_name="risk_questionnaires")

    op.drop_index(op.f("ix_risk_questionnaires_status"), table_name="risk_questionnaires")
    op.drop_index(op.f("ix_risk_questionnaires_assigned_to_user_id"), table_name="risk_questionnaires")
    op.drop_index(op.f("ix_risk_questionnaires_risk_id"), table_name="risk_questionnaires")
    op.drop_table("risk_questionnaires")

    sa.Enum(name="risk_questionnaire_status").drop(op.get_bind(), checkfirst=True)

