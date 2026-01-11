"""add_server_default_to_requires_privileged_approval

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-01-11 22:25:00.000000

Adds server_default to requires_privileged_approval column for safety
when adding rows to approval_requests table via raw SQL inserts.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'l6m7n8o9p0q1'
down_revision: Union[str, Sequence[str], None] = 'k5l6m7n8o9p0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add server_default to requires_privileged_approval column."""
    op.alter_column('approval_requests', 'requires_privileged_approval',
                    server_default='false',
                    existing_type=sa.Boolean(),
                    existing_nullable=False)


def downgrade() -> None:
    """Remove server_default from requires_privileged_approval column."""
    op.alter_column('approval_requests', 'requires_privileged_approval',
                    server_default=None,
                    existing_type=sa.Boolean(),
                    existing_nullable=False)
