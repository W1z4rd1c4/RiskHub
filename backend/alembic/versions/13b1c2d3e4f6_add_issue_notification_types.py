"""Extend notification_type enum for issue workflow notifications.

Revision ID: 13b1c2d3e4f6
Revises: 13a1b2c3d4e5
Create Date: 2026-02-11
"""

from typing import Sequence, Union

from alembic import op


revision: str = "13b1c2d3e4f6"
down_revision: Union[str, Sequence[str], None] = "13a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_context().dialect.name != "postgresql":
        return

    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ISSUE_ASSIGNED'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ISSUE_DUE_SOON'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ISSUE_OVERDUE'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ISSUE_EXCEPTION_REQUESTED'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ISSUE_EXCEPTION_APPROVED'")


def downgrade() -> None:
    # PostgreSQL enum labels cannot be safely removed in-place.
    return None
