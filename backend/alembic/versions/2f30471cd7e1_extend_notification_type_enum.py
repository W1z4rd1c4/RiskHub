"""extend notification_type for questionnaire clarification

Revision ID: 2f30471cd7e1
Revises: 0e46ca66063d
Create Date: 2026-01-24 23:26:59.589063

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f30471cd7e1'
down_revision: Union[str, Sequence[str], None] = '0e46ca66063d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'QUESTIONNAIRE_CLARIFICATION_REQUESTED'")


def downgrade() -> None:
    """Cannot safely remove enum values in PostgreSQL - this is a no-op."""
    return None
