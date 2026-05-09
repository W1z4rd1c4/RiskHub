"""Convert approval_scenarios.approver_roles to JSON/JSONB.

Downgrade is intentionally forward-only. See docs/adr/ADR-010-postgres-migration-rehearsal-contract.md.
"""

from __future__ import annotations

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


def upgrade() -> None:
    dialect = op.get_context().dialect.name
    if dialect == "postgresql":
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
