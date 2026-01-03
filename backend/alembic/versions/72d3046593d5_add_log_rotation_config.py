"""add_log_rotation_config

Revision ID: 72d3046593d5
Revises: 74f4ad1b68cb
Create Date: 2026-01-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '72d3046593d5'
down_revision: Union[str, Sequence[str], None] = 'f3a1b2c4e5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add log rotation configuration settings."""
    # Add log rotation config values to global_config
    op.execute("""
        INSERT INTO global_config (key, value, value_type, category, display_name, description, min_value, max_value, is_editable)
        VALUES 
        ('log_rotation_size_mb', '10', 'int', 'system', 'Log Rotation Size (MB)', 'Maximum size of each log file before rotation in megabytes', 1, 100, true),
        ('log_retention_count', '10', 'int', 'system', 'Log Retention Count', 'Number of backup log files to keep after rotation', 1, 50, true)
    """)


def downgrade() -> None:
    """Remove log rotation configuration settings."""
    op.execute("""
        DELETE FROM global_config 
        WHERE key IN ('log_rotation_size_mb', 'log_retention_count')
    """)
