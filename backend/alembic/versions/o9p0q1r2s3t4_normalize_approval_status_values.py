"""Normalize approval_status values to uppercase

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-01-18

Fixes historical data drift where 'pending_privileged' (lowercase) was inserted
due to case mismatch in earlier migration. Normalizes all to 'PENDING_PRIVILEGED'.

Also handles any duplicate pending approvals that may have been created while
the unique index was missing (migration 6df2bb0adaa3 dropped it).
"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'o9p0q1r2s3t4'
down_revision: Union[str, Sequence[str], None] = 'n8o9p0q1r2s3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Normalize lowercase pending_privileged to uppercase PENDING_PRIVILEGED.
    
    Also cleans up any duplicates that may have been created while the
    unique index was missing, keeping the earliest created_at.
    """
    # Step 1: Normalize lowercase status to uppercase
    op.execute("""
        UPDATE approval_requests
        SET status = 'PENDING_PRIVILEGED'
        WHERE status = 'pending_privileged'
    """)
    
    # Step 2: Clean up duplicates if any exist
    # Keep the earliest created_at, cancel the rest
    # This is a safety measure - the index should prevent duplicates going forward
    op.execute("""
        WITH duplicates AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY resource_type, resource_id, action_type
                       ORDER BY created_at ASC
                   ) as rn
            FROM approval_requests
            WHERE status IN ('PENDING', 'PENDING_PRIVILEGED')
        )
        UPDATE approval_requests
        SET status = 'CANCELLED',
            resolution_notes = 'Auto-cancelled: duplicate pending approval cleaned up during migration o9p0q1r2s3t4'
        WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
    """)


def downgrade() -> None:
    """No downgrade needed - data normalization is one-way.
    
    We cannot reliably restore which rows were originally lowercase,
    and the cancelled duplicates cannot be safely un-cancelled.
    """
    pass
