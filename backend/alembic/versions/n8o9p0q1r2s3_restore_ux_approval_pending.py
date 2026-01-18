"""Restore ux_approval_pending partial unique index

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-01-18

Fixes:
1. Migration 6df2bb0adaa3 dropped ux_approval_pending on upgrade but never recreated it.
2. Original migration h2i3j4k5l6m7 used 'pending_privileged' (lowercase) but enum uses 'PENDING_PRIVILEGED'.

This migration:
- Recreates the partial unique index with a predicate covering all pending-queue statuses
- Handles both uppercase (PENDING_PRIVILEGED) and historical lowercase (pending_privileged) values
- Uses IF NOT EXISTS for idempotency
"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'n8o9p0q1r2s3'
down_revision: Union[str, Sequence[str], None] = 'm7n8o9p0q1r2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Restore the partial unique index for pending approval requests.
    
    The predicate covers all status values that represent "pending queue":
    - PENDING (uppercase, standard)
    - PENDING_PRIVILEGED (uppercase, tiered approval)
    - pending_privileged (lowercase, historical drift from earlier migration)
    
    This prevents duplicate approvals for the same (resource_type, resource_id, action_type)
    while any of these statuses are active.
    """
    # Drop if exists to handle case where it was partially recreated
    op.execute("DROP INDEX IF EXISTS ux_approval_pending")
    
    op.execute("""
        CREATE UNIQUE INDEX ux_approval_pending
        ON approval_requests (resource_type, resource_id, action_type)
        WHERE status IN ('PENDING', 'PENDING_PRIVILEGED', 'pending_privileged')
    """)


def downgrade() -> None:
    """Remove the partial unique index."""
    op.execute("DROP INDEX IF EXISTS ux_approval_pending")
