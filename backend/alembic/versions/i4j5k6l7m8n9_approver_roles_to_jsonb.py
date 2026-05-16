"""Convert approval_scenarios.approver_roles to JSON/JSONB.

Downgrade is intentionally forward-only. See docs/adr/ADR-010-postgres-migration-rehearsal-contract.md.
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "i4j5k6l7m8n9"
down_revision: Union[str, Sequence[str], None] = "h3i4j5k6l7m8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APPROVER_ROLES_TYPE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _malformed_approver_roles_json_row_ids(connection) -> list[int]:
    rows = connection.execute(
        sa.text(
            """
            SELECT id, approver_roles FROM approval_scenarios
            WHERE approver_roles IS NOT NULL
            """
        )
    ).all()
    malformed_ids: list[int] = []
    for row_id, raw_roles in rows:
        try:
            json.loads(raw_roles)
        except (TypeError, json.JSONDecodeError):
            malformed_ids.append(row_id)
    return malformed_ids


def upgrade() -> None:
    dialect = op.get_context().dialect.name
    if dialect == "postgresql":
        bind = op.get_bind()
        malformed_ids = _malformed_approver_roles_json_row_ids(bind)
        if malformed_ids:
            raise RuntimeError(f"Malformed approver_roles JSON rows before JSONB migration: {malformed_ids}")

        op.alter_column(
            "approval_scenarios",
            "approver_roles",
            type_=APPROVER_ROLES_TYPE,
            existing_nullable=False,
            postgresql_using="approver_roles::jsonb",
        )
    elif dialect == "sqlite":
        # SQLite stores JSON as text; SQLAlchemy's model type owns serialization.
        return
    else:
        op.alter_column(
            "approval_scenarios",
            "approver_roles",
            type_=APPROVER_ROLES_TYPE,
            existing_nullable=False,
        )


def downgrade() -> None:
    """Forward-only; restore from a pre-upgrade snapshot per ADR-010."""

    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
