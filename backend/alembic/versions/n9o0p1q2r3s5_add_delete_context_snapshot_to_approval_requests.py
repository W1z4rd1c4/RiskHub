"""Add delete context snapshot to approval requests.

Revision ID: n9o0p1q2r3s5
Revises: n9o0p1q2r3s4
Create Date: 2026-05-26

Forward-only per ADR-010.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n9o0p1q2r3s5"
down_revision: Union[str, Sequence[str], None] = "n9o0p1q2r3s4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("approval_requests", sa.Column("delete_context_snapshot", sa.JSON(), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
