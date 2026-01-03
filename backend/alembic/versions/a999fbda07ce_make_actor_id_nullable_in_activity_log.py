"""make_actor_id_nullable_in_activity_log

Revision ID: a999fbda07ce
Revises: 72d3046593d5
Create Date: 2026-01-04 00:56:50.021922

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a999fbda07ce'
down_revision: Union[str, Sequence[str], None] = '72d3046593d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('activity_logs', schema=None) as batch_op:
        batch_op.alter_column('actor_id',
               existing_type=sa.INTEGER(),
               nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('activity_logs', schema=None) as batch_op:
        batch_op.alter_column('actor_id',
               existing_type=sa.INTEGER(),
               nullable=False)
