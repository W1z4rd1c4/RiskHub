"""add open questionnaire unique index

Revision ID: a7b8c9d0e1f2
Revises: z6a7b8c9d0e1
Create Date: 2026-04-24

"""

from typing import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "z6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Prevent more than one open questionnaire per risk."""
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_risk_questionnaires_one_open_per_risk
        ON risk_questionnaires (risk_id)
        WHERE status IN ('sent', 'in_progress')
        """
    )


def downgrade() -> None:
    """Remove the open-questionnaire uniqueness guard."""
    op.execute("DROP INDEX IF EXISTS ux_risk_questionnaires_one_open_per_risk")
