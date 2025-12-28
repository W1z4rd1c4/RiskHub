"""migrate_pending_changes_to_json_and_timezone

Revision ID: a1b2c3d4e5f6
Revises: 49d28c3c644e
Create Date: 2025-12-27 23:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '49d28c3c644e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: Convert pending_changes to JSON and created_at to timezone-aware."""
    # PostgreSQL requires USING clause for text to json conversion
    op.execute("""
        ALTER TABLE approval_requests 
        ALTER COLUMN pending_changes TYPE JSON 
        USING pending_changes::json
    """)
    op.execute("""
        ALTER TABLE approval_requests 
        ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC'
    """)


def downgrade() -> None:
    """Downgrade schema: Revert to Text and naive DateTime."""
    op.execute("""
        ALTER TABLE approval_requests 
        ALTER COLUMN pending_changes TYPE TEXT 
        USING pending_changes::text
    """)
    op.execute("""
        ALTER TABLE approval_requests 
        ALTER COLUMN created_at TYPE TIMESTAMP 
    """)
