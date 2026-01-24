"""add questionnaire notification types

Revision ID: b14c1d2e3f4a
Revises: a14b0c9d1e2f
Create Date: 2026-01-24

"""
from alembic import op


revision = "b14c1d2e3f4a"
down_revision = "a14b0c9d1e2f"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'questionnaire_sent'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'questionnaire_due_soon'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'questionnaire_overdue'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'questionnaire_submitted'")


def downgrade():
    """Cannot remove enum values in PostgreSQL - this is a no-op."""
    pass

