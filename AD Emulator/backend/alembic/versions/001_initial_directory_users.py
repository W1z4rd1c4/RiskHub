"""Initial directory users table

Revision ID: 001_initial
Revises: 
Create Date: 2025-12-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'directory_users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('external_id', sa.String(100), nullable=False, unique=True, index=True),
        sa.Column('user_principal_name', sa.String(255), nullable=True, index=True),
        sa.Column('email', sa.String(255), nullable=True, index=True),
        sa.Column('display_name', sa.String(255), nullable=False),
        sa.Column('given_name', sa.String(100), nullable=True),
        sa.Column('surname', sa.String(100), nullable=True),
        sa.Column('department', sa.String(255), nullable=True),
        sa.Column('job_title', sa.String(255), nullable=True),
        sa.Column('manager_external_id', sa.String(100), nullable=True),
        sa.Column('account_enabled', sa.Boolean(), default=True, index=True, nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=True),
        sa.Column('source_payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('directory_users')
