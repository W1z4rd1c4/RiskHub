"""fix_approval_status_enum_case

Adds PENDING_PRIVILEGED (uppercase) to approval_status enum.
Previous migration added lowercase 'pending_privileged' but model uses uppercase.
PostgreSQL enums are case-sensitive so we need the uppercase version.

Revision ID: j4k5l6m7n8o9
Revises: d70dbd1207cb
Create Date: 2026-01-11
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'j4k5l6m7n8o9'
down_revision = 'd70dbd1207cb'
branch_labels = None
depends_on = None


def upgrade():
    """Add uppercase PENDING_PRIVILEGED to approval_status enum."""
    op.execute("ALTER TYPE approval_status ADD VALUE IF NOT EXISTS 'PENDING_PRIVILEGED'")


def downgrade():
    """Cannot remove enum values in PostgreSQL - this is a no-op."""
    pass
