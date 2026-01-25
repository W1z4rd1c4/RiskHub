"""Extend notification_type enum for Phase 18 vendor notifications.

Revision ID: d18e00a1b2c3
Revises: ce7983fc1f30
Create Date: 2026-01-25
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d18e00a1b2c3"
down_revision: Union[str, Sequence[str], None] = "ce7983fc1f30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep clarification type safe across environments.
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'QUESTIONNAIRE_CLARIFICATION_REQUESTED'")

    # Vendor assessment workflow
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_ASSESSMENT_SUBMITTED'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_ASSESSMENT_COMMITTEE_RECOMMENDED'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_ASSESSMENT_DECIDED'")

    # Reassessment scheduling
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_REASSESSMENT_DUE_SOON'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_REASSESSMENT_OVERDUE'")

    # Vendor SLA monitoring
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_SLA_DUE_SOON'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_SLA_DUE_TOMORROW'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_SLA_OVERDUE'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_SLA_NEAR_BREACH'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'VENDOR_SLA_BREACH_DETECTED'")


def downgrade() -> None:
    """Cannot safely remove enum values in PostgreSQL - this is a no-op."""
    return None

