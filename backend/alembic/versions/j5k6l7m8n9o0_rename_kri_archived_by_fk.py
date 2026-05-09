"""Rename KRI archived_by foreign key for ArchivableMixin.

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-05-09
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "j5k6l7m8n9o0"
down_revision: Union[str, Sequence[str], None] = "i4j5k6l7m8n9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_context().dialect.name == "sqlite":
        return

    op.drop_constraint(
        "fk_key_risk_indicators_archived_by_id",
        "key_risk_indicators",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_key_risk_indicators_archived_by_id_users",
        "key_risk_indicators",
        "users",
        ["archived_by_id"],
        ["id"],
    )


def downgrade() -> None:
    """Forward-only; restore from a pre-upgrade snapshot per ADR-010."""

    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
