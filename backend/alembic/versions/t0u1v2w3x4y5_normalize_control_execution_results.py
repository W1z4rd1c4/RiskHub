"""normalize control execution result values

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-03-07 21:40:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "t0u1v2w3x4y5"
down_revision: Union[str, Sequence[str], None] = "s9t0u1v2w3x4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        """
        UPDATE control_executions
        SET result = CASE result
            WHEN 'pass' THEN 'passed'
            WHEN 'fail' THEN 'failed'
            WHEN 'issues_found' THEN 'warning'
            ELSE result
        END
        WHERE result IN ('pass', 'fail', 'issues_found')
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        """
        UPDATE control_executions
        SET result = CASE result
            WHEN 'passed' THEN 'pass'
            WHEN 'failed' THEN 'fail'
            WHEN 'warning' THEN 'issues_found'
            ELSE result
        END
        WHERE result IN ('passed', 'failed', 'warning')
        """
    )
