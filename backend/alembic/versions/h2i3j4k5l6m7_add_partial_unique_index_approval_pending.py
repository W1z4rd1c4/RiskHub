"""add_partial_unique_index_approval_pending

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-01-10

Adds a partial unique index to prevent duplicate PENDING/PENDING_PRIVILEGED 
approval requests for the same (resource_type, resource_id, action_type).
"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'h2i3j4k5l6m7'
down_revision: str | None = 'g1h2i3j4k5l6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add partial unique index for pending approval requests."""
    # This prevents duplicate PENDING/PENDING_PRIVILEGED approvals for same (resource_type, resource_id, action_type)
    # Works on both PostgreSQL and SQLite 3.9+
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ux_approval_pending 
        ON approval_requests (resource_type, resource_id, action_type) 
        WHERE status = 'PENDING' OR status = 'pending_privileged'
    """)


def downgrade() -> None:
    """Remove the partial unique index."""
    op.execute("DROP INDEX IF EXISTS ux_approval_pending")
