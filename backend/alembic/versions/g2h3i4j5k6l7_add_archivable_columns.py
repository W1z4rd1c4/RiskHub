"""Add archivable columns to risk, control, and vendor entities."""

# See docs/adr/ADR-010-postgres-migration-rehearsal-contract.md for migration discipline.

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "g2h3i4j5k6l7"
down_revision: Union[str, Sequence[str], None] = "f1a2b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("risks", "controls", "vendors")


def _add_archivable_columns(table_name: str, *, create_fk: bool) -> None:
    op.add_column(
        table_name,
        sa.Column("is_archived", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(table_name, sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(table_name, sa.Column("archived_by_id", sa.Integer(), nullable=True))
    if create_fk:
        op.create_foreign_key(
            f"fk_{table_name}_archived_by_id_users",
            table_name,
            "users",
            ["archived_by_id"],
            ["id"],
        )
    op.create_index(f"ix_{table_name}_is_archived", table_name, ["is_archived"], if_not_exists=True)


def upgrade() -> None:
    create_fk = op.get_context().dialect.name != "sqlite"
    for table_name in TABLES:
        _add_archivable_columns(table_name, create_fk=create_fk)

    op.execute("UPDATE risks SET is_archived = true WHERE status = 'archived'")
    op.execute("UPDATE controls SET is_archived = true WHERE status = 'archived'")
    op.execute("UPDATE vendors SET is_archived = true WHERE status = 'inactive'")


def downgrade() -> None:
    drop_fk = op.get_context().dialect.name != "sqlite"
    for table_name in reversed(TABLES):
        op.drop_index(f"ix_{table_name}_is_archived", table_name=table_name, if_exists=True)
        if drop_fk:
            op.drop_constraint(f"fk_{table_name}_archived_by_id_users", table_name, type_="foreignkey")
        op.drop_column(table_name, "archived_by_id")
        op.drop_column(table_name, "archived_at")
        op.drop_column(table_name, "is_archived")
