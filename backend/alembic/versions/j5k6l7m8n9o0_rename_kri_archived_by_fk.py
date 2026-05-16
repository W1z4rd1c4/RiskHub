"""Rename KRI archived_by foreign key for ArchivableMixin.

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-05-09
"""

# See docs/adr/ADR-010-postgres-migration-rehearsal-contract.md for migration discipline.

from __future__ import annotations

import logging
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "j5k6l7m8n9o0"
down_revision: Union[str, Sequence[str], None] = "i4j5k6l7m8n9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(__name__)


def _existing_fk_name(connection, *, table: str, column: str, ref_table: str) -> str | None:
    row = connection.execute(
        text(
            """
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.contype = 'f'
              AND c.conrelid = to_regclass(:table)
              AND c.confrelid = to_regclass(:ref_table)
              AND a.attname = :column
            LIMIT 1
            """
        ),
        {"table": table, "column": column, "ref_table": ref_table},
    ).first()
    return row[0] if row is not None else None


def upgrade() -> None:
    if op.get_context().dialect.name == "sqlite":
        return

    bind = op.get_bind()
    name = _existing_fk_name(
        bind,
        table="key_risk_indicators",
        column="archived_by_id",
        ref_table="users",
    )
    if name == "fk_key_risk_indicators_archived_by_id_users":
        logger.info("j5k6l7m8n9o0: KRI archived_by FK already migrated")
        return
    if name == "fk_key_risk_indicators_archived_by_id":
        op.drop_constraint("fk_key_risk_indicators_archived_by_id", "key_risk_indicators", type_="foreignkey")
    elif name is None:
        logger.info("j5k6l7m8n9o0: OLD FK absent; creating NEW only")
    else:
        raise RuntimeError(
            f"unexpected FK name on key_risk_indicators.archived_by_id \u2192 users: {name!r}; resolve manually"
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
