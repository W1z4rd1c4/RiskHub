"""add_approval_cancelled_notification

Adds approval_cancelled to notification_type enum.
The NotificationType model already has APPROVAL_CANCELLED but DB enum was missing it.

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-01-11
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'k5l6m7n8o9p0'
down_revision = 'j4k5l6m7n8o9'  # Previous migration from Plan 01
branch_labels = None
depends_on = None


def upgrade():
    """Add approval_cancelled to notification_type enum."""
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'approval_cancelled'")


def downgrade():
    """Cannot remove enum values in PostgreSQL - this is a no-op."""
    pass
