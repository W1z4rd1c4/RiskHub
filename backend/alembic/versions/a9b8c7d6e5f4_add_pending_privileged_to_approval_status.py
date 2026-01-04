"""add_pending_privileged_to_approval_status

Revision ID: a9b8c7d6e5f4
Revises: f3a1b2c4e5d6
Create Date: 2026-01-04 18:35:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a9b8c7d6e5f4'
down_revision = 'f3a1b2c4e5d6'
branch_labels = None
depends_on = None


def upgrade():
    """Add PENDING_PRIVILEGED to approval_status enum."""
    # PostgreSQL requires ALTER TYPE to add enum values
    op.execute("ALTER TYPE approval_status ADD VALUE IF NOT EXISTS 'pending_privileged'")


def downgrade():
    """Cannot remove enum value in PostgreSQL - this is a no-op."""
    # PostgreSQL doesn't support removing enum values
    # To fully remove, we'd need to recreate the enum and all columns using it
    pass
