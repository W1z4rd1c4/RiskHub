"""Add missing columns and extend notification enum

Revision ID: e3f4a5b6c7d8
Revises: d91a5e7c3b12
Create Date: 2026-01-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, Sequence[str], None] = 'd91a5e7c3b12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Upgrade schema."""
    # Add departments.is_system column with default false (if not exists)
    if not column_exists('departments', 'is_system'):
        op.add_column(
            'departments',
            sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false', comment='System departments cannot be deleted')
        )
    
    # Add users.employee_type column with default 'employee' (if not exists)
    if not column_exists('users', 'employee_type'):
        op.add_column(
            'users',
            sa.Column('employee_type', sa.String(length=50), nullable=True, server_default='employee')
        )
    
    # Extend notification_type enum to include KRI_BREACH_DETECTED
    # PostgreSQL requires ALTER TYPE to add enum values
    # IF NOT EXISTS prevents error if already added
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'KRI_BREACH_DETECTED'")


def downgrade() -> None:
    """Downgrade schema."""
    # Drop columns if they exist
    if column_exists('users', 'employee_type'):
        op.drop_column('users', 'employee_type')
    if column_exists('departments', 'is_system'):
        op.drop_column('departments', 'is_system')
    
    # Note: PostgreSQL doesn't support removing enum values easily
    # The enum value will remain but unused

