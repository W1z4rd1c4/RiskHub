"""add_total_assets_value_config

Revision ID: e224362e51f0
Revises: i3j4k5l6m7n8
Create Date: 2026-01-10 22:08:30.054713

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e224362e51f0'
down_revision: Union[str, Sequence[str], None] = 'i3j4k5l6m7n8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add total_assets_value config for financial loss calculations."""
    op.execute("""
        INSERT INTO global_config (key, value, value_type, category, display_name, description, min_value, max_value, is_editable)
        VALUES (
            'total_assets_value',
            '10000000000',
            'int',
            'risk_thresholds',
            'Total Assets Value',
            'Company total asset value used to calculate financial loss thresholds for risk impact levels',
            1000000,
            NULL,
            true
        )
        ON CONFLICT (key) DO UPDATE SET display_name = 'Total Assets Value'
    """)


def downgrade() -> None:
    """Remove total_assets_value config."""
    op.execute("DELETE FROM global_config WHERE key = 'total_assets_value'")
