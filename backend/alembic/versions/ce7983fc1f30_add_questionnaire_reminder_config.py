"""add questionnaire reminder config

Revision ID: ce7983fc1f30
Revises: 2f30471cd7e1
Create Date: 2026-01-24 23:32:55.736522

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ce7983fc1f30'
down_revision: Union[str, Sequence[str], None] = '2f30471cd7e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO global_config (key, value, value_type, category, display_name, description, min_value, max_value, is_editable)
        VALUES (
            'questionnaire_pre_due_reminder_days',
            '2',
            'int',
            'notifications',
            'Questionnaire Pre-Due Reminder Days',
            'Send a due-soon reminder when due_date == (today + N days)',
            0,
            30,
            true
        )
        ON CONFLICT (key) DO UPDATE SET display_name = 'Questionnaire Pre-Due Reminder Days'
        """
    )

    op.execute(
        """
        INSERT INTO global_config (key, value, value_type, category, display_name, description, min_value, max_value, is_editable)
        VALUES (
            'questionnaire_overdue_reminder_weekday',
            '0',
            'int',
            'notifications',
            'Questionnaire Overdue Reminder Weekday',
            'Send overdue reminders only when today.weekday() == value (Python weekday: Monday=0 ... Sunday=6)',
            0,
            6,
            true
        )
        ON CONFLICT (key) DO UPDATE SET display_name = 'Questionnaire Overdue Reminder Weekday'
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM global_config WHERE key = 'questionnaire_pre_due_reminder_days'")
    op.execute("DELETE FROM global_config WHERE key = 'questionnaire_overdue_reminder_weekday'")
