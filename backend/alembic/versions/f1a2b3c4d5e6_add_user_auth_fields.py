"""add_user_auth_fields

Revision ID: f1a2b3c4d5e6
Revises: ea7bcb7ce36b
Create Date: 2025-12-26 19:54:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'ea7bcb7ce36b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add hashed_password column (nullable for future Entra ID integration)
    op.add_column('users', sa.Column('hashed_password', sa.String(length=255), nullable=True))
    
    # Add manager_id column for hierarchical relationships
    op.add_column('users', sa.Column('manager_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_users_manager_id', 'users', 'users', ['manager_id'], ['id'])
    op.create_index('ix_users_manager_id', 'users', ['manager_id'])


def downgrade() -> None:
    # Remove manager_id column and constraints
    op.drop_index('ix_users_manager_id', table_name='users')
    op.drop_constraint('fk_users_manager_id', 'users', type_='foreignkey')
    op.drop_column('users', 'manager_id')
    
    # Remove hashed_password column
    op.drop_column('users', 'hashed_password')
