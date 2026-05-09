"""Add indexes for issue link target lookups."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e0f1a2b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEXES = (
    ("ix_issue_links_risk_id", ["risk_id"]),
    ("ix_issue_links_control_id", ["control_id"]),
    ("ix_issue_links_execution_id", ["execution_id"]),
    ("ix_issue_links_kri_id", ["kri_id"]),
)


def upgrade() -> None:
    context = op.get_context()
    if context.dialect.name == "postgresql":
        with context.autocommit_block():
            for index_name, columns in INDEXES:
                op.create_index(
                    index_name,
                    "issue_links",
                    columns,
                    if_not_exists=True,
                    postgresql_concurrently=True,
                )
        return

    for index_name, columns in INDEXES:
        op.create_index(index_name, "issue_links", columns, if_not_exists=True)


def downgrade() -> None:
    context = op.get_context()
    if context.dialect.name == "postgresql":
        with context.autocommit_block():
            for index_name, _columns in reversed(INDEXES):
                op.drop_index(
                    index_name,
                    table_name="issue_links",
                    if_exists=True,
                    postgresql_concurrently=True,
                )
        return

    for index_name, _columns in reversed(INDEXES):
        op.drop_index(index_name, table_name="issue_links", if_exists=True)
