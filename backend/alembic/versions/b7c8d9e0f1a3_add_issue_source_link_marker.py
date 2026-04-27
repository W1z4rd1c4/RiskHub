"""Add issue source link marker.

Revision ID: b7c8d9e0f1a3
Revises: a7b8c9d0e1f2
Create Date: 2026-04-27

"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7c8d9e0f1a3"
down_revision: str | Sequence[str] | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Persist explicit issue source-link provenance."""
    with op.batch_alter_table("issue_links", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("is_source_link", sa.Boolean(), server_default=sa.false(), nullable=False)
        )


def downgrade() -> None:
    """Remove issue source-link provenance marker."""
    with op.batch_alter_table("issue_links", schema=None) as batch_op:
        batch_op.drop_column("is_source_link")
