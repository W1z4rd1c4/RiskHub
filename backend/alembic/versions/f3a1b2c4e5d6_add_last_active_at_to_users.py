"""add last_active_at to users

Revision ID: f3a1b2c4e5d6
Revises: 0f9fcd4d46c5
Create Date: 2026-01-03 15:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3a1b2c4e5d6'
down_revision = '0f9fcd4d46c5'
branch_labels = None
depends_on = None


def upgrade():
    # Add last_active_at column to users table
    op.add_column('users', sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_users_last_active_at'), 'users', ['last_active_at'], unique=False)


def downgrade():
    # Remove last_active_at column from users table
    op.drop_index(op.f('ix_users_last_active_at'), table_name='users')
    op.drop_column('users', 'last_active_at')
