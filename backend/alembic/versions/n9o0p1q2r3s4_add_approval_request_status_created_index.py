"""Add approval queue status/created_at index.

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-05-24

Forward-only per ADR-010.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "n9o0p1q2r3s4"
down_revision: Union[str, Sequence[str], None] = "m8n9o0p1q2r3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_approval_requests_status_created_at"


def upgrade() -> None:
    op.create_index(INDEX_NAME, "approval_requests", ["status", "created_at"], unique=False)


def downgrade() -> None:
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
