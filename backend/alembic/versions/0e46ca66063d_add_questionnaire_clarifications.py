"""add questionnaire clarifications

Revision ID: 0e46ca66063d
Revises: d14e4f5a6b7c
Create Date: 2026-01-24 23:26:59.089908

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0e46ca66063d'
down_revision: Union[str, Sequence[str], None] = 'd14e4f5a6b7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "risk_questionnaire_clarifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "questionnaire_id",
            sa.Integer(),
            sa.ForeignKey("risk_questionnaires.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("section_key", sa.String(length=200), nullable=False),
        sa.Column("question_keys", sa.JSON(), nullable=True),
        sa.Column("request_message", sa.Text(), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("response_message", sa.Text(), nullable=True),
        sa.Column("responded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "ix_risk_questionnaire_clarifications_questionnaire_id",
        "risk_questionnaire_clarifications",
        ["questionnaire_id"],
    )
    op.create_index(
        "ix_risk_questionnaire_clarifications_requested_by_user_id",
        "risk_questionnaire_clarifications",
        ["requested_by_user_id"],
    )
    op.create_index(
        "ix_risk_questionnaire_clarifications_responded_by_user_id",
        "risk_questionnaire_clarifications",
        ["responded_by_user_id"],
    )
    op.create_index(
        "ix_risk_questionnaire_clarifications_questionnaire_section",
        "risk_questionnaire_clarifications",
        ["questionnaire_id", "section_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_risk_questionnaire_clarifications_questionnaire_section", table_name="risk_questionnaire_clarifications")
    op.drop_index("ix_risk_questionnaire_clarifications_responded_by_user_id", table_name="risk_questionnaire_clarifications")
    op.drop_index("ix_risk_questionnaire_clarifications_requested_by_user_id", table_name="risk_questionnaire_clarifications")
    op.drop_index("ix_risk_questionnaire_clarifications_questionnaire_id", table_name="risk_questionnaire_clarifications")
    op.drop_table("risk_questionnaire_clarifications")
