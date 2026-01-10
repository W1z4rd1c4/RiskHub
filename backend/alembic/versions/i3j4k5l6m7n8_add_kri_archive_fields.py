"""add_kri_archive_fields

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-01-10
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'i3j4k5l6m7n8'
down_revision = 'h2i3j4k5l6m7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add archive fields to key_risk_indicators table
    op.add_column('key_risk_indicators', sa.Column('is_archived', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('key_risk_indicators', sa.Column('archived_at', sa.DateTime(), nullable=True))
    op.add_column('key_risk_indicators', sa.Column('archived_by_id', sa.Integer(), nullable=True))
    
    # Add index on is_archived for efficient filtering
    op.create_index(op.f('ix_key_risk_indicators_is_archived'), 'key_risk_indicators', ['is_archived'], unique=False)
    
    # Add foreign key for archived_by_id
    op.create_foreign_key(
        'fk_key_risk_indicators_archived_by_id', 
        'key_risk_indicators', 
        'users', 
        ['archived_by_id'], 
        ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_key_risk_indicators_archived_by_id', 'key_risk_indicators', type_='foreignkey')
    op.drop_index(op.f('ix_key_risk_indicators_is_archived'), table_name='key_risk_indicators')
    op.drop_column('key_risk_indicators', 'archived_by_id')
    op.drop_column('key_risk_indicators', 'archived_at')
    op.drop_column('key_risk_indicators', 'is_archived')
