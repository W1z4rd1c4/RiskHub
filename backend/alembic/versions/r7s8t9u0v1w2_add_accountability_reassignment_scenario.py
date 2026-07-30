"""add accountability reassignment scenario

Revision ID: r7s8t9u0v1w2
Revises: p6q7r8s9t0u1
Create Date: 2026-07-30 12:00:00.000000

Forward-only per ADR-010 and ADR-016.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r7s8t9u0v1w2"
down_revision: Union[str, Sequence[str], None] = "p6q7r8s9t0u1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO approval_scenarios
                (key, display_name, description, requires_approval, approver_roles)
            SELECT
                'accountability_reassignment',
                'Accountability reassignments',
                'Independent approval for accountable user or owning department changes',
                true,
                :roles
            WHERE NOT EXISTS (
                SELECT 1
                FROM approval_scenarios
                WHERE key = 'accountability_reassignment'
            )
            """
        ).bindparams(
            sa.bindparam(
                "roles",
                value=["risk_manager", "cro"],
                type_=sa.JSON(),
            )
        )
    )


def downgrade() -> None:
    raise NotImplementedError(
        "Forward-only migration. Restore from snapshot per ADR-010."
    )
