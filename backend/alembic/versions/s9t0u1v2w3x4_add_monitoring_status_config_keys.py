"""add monitoring status config keys

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-03-07 16:25:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "s9t0u1v2w3x4"
down_revision: Union[str, Sequence[str], None] = "r8s9t0u1v2w3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        """
        INSERT INTO global_config (key, value, value_type, category, display_name, description, min_value, max_value, is_editable)
        VALUES
        (
            'control_execution_stale_days',
            '365',
            'int',
            'monitoring',
            'Control Execution Stale Days',
            'Days after the latest control execution before monitoring status becomes Needs Review',
            1,
            3650,
            true
        ),
        (
            'kri_warning_upper_margin_ratio',
            '0.10',
            'string',
            'monitoring',
            'KRI Warning Upper Margin Ratio',
            'Upper-limit warning margin ratio used to classify KRI monitoring status as Warning while still within limits',
            NULL,
            NULL,
            true
        )
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        """
        DELETE FROM global_config
        WHERE key IN ('control_execution_stale_days', 'kri_warning_upper_margin_ratio')
        """
    )
