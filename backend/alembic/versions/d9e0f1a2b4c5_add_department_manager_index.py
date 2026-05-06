"""Add index for department manager lookups."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d9e0f1a2b4c5"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_departments_manager_id"


def upgrade() -> None:
    context = op.get_context()
    if context.dialect.name == "postgresql":
        with context.autocommit_block():
            op.create_index(
                INDEX_NAME,
                "departments",
                ["manager_id"],
                if_not_exists=True,
                postgresql_concurrently=True,
            )
        return

    op.create_index(INDEX_NAME, "departments", ["manager_id"], if_not_exists=True)


def downgrade() -> None:
    context = op.get_context()
    if context.dialect.name == "postgresql":
        with context.autocommit_block():
            op.drop_index(
                INDEX_NAME,
                table_name="departments",
                if_exists=True,
                postgresql_concurrently=True,
            )
        return

    op.drop_index(INDEX_NAME, table_name="departments", if_exists=True)
