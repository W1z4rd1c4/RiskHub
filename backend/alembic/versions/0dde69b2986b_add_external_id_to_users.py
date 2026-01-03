"""add_external_id_to_users

Revision ID: 0dde69b2986b
Revises: 9d1f2c3b4e5f
Create Date: 2025-12-28 23:50:03.791022

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0dde69b2986b'
down_revision: Union[str, Sequence[str], None] = '9d1f2c3b4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_users_external_id'), 'users', ['external_id'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_users_external_id'), table_name='users')
    op.drop_column('users', 'external_id')
