"""Add unique KRI value-history period constraint.

Revision ID: m8n9o0p1q2r3
Revises: l7m8n9o0p1q2
Create Date: 2026-05-24

Forward-only per ADR-010.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m8n9o0p1q2r3"
down_revision: Union[str, Sequence[str], None] = "l7m8n9o0p1q2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT_NAME = "uq_kri_value_history_kri_period_end"


def _preflight_duplicate_periods() -> None:
    bind = op.get_bind()
    duplicates = bind.execute(
        sa.text(
            """
            SELECT kri_id, period_end, COUNT(*) AS duplicate_count
            FROM kri_value_history
            GROUP BY kri_id, period_end
            HAVING COUNT(*) > 1
            ORDER BY duplicate_count DESC, kri_id, period_end
            LIMIT 20
            """
        )
    ).mappings().all()
    if not duplicates:
        return

    groups = ", ".join(
        f"kri_id={row['kri_id']} period_end={row['period_end']} count={row['duplicate_count']}"
        for row in duplicates
    )
    raise RuntimeError(
        "Duplicate KRI value history rows must be resolved before adding "
        f"{CONSTRAINT_NAME}: {groups}"
    )


def upgrade() -> None:
    _preflight_duplicate_periods()
    with op.batch_alter_table("kri_value_history", schema=None) as batch_op:
        batch_op.create_unique_constraint(CONSTRAINT_NAME, ["kri_id", "period_end"])


def downgrade() -> None:
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
