"""Unify archive state into is_archived columns.

Downgrade is intentionally forward-only. See docs/adr/ADR-010-postgres-migration-rehearsal-contract.md.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "h3i4j5k6l7m8"
down_revision: Union[str, Sequence[str], None] = "g2h3i4j5k6l7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE risks SET is_archived = true WHERE status = 'archived'")
    op.execute("UPDATE risks SET status = 'active' WHERE status = 'archived'")
    op.execute("UPDATE controls SET is_archived = true WHERE status = 'archived'")
    op.execute("UPDATE controls SET status = 'active' WHERE status = 'archived'")
    op.execute("UPDATE vendors SET is_archived = true WHERE status = 'inactive'")
    op.execute("UPDATE vendors SET status = 'active' WHERE status = 'inactive'")


def downgrade() -> None:
    """Forward-only; restore from a pre-upgrade snapshot per ADR-010."""

    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
