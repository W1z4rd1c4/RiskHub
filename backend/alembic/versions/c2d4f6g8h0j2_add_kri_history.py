"""Add KRI historization fields and history table

Revision ID: c2d4f6g8h0j2
Revises: 514f30f4b0c9
Create Date: 2025-12-30

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import func


# revision identifiers, used by Alembic.
revision = 'c2d4f6g8h0j2'
down_revision = '514f30f4b0c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to key_risk_indicators table
    op.add_column('key_risk_indicators', sa.Column('frequency', sa.String(20), server_default='quarterly', nullable=False))
    op.add_column('key_risk_indicators', sa.Column('reporting_owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('key_risk_indicators', sa.Column('last_period_end', sa.Date(), nullable=True))
    op.add_column('key_risk_indicators', sa.Column('last_reported_at', sa.DateTime(), server_default=func.now(), nullable=False))
    
    # Create index on reporting_owner_id
    op.create_index('ix_key_risk_indicators_reporting_owner_id', 'key_risk_indicators', ['reporting_owner_id'])
    
    # Create kri_value_history table
    op.create_table(
        'kri_value_history',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('kri_id', sa.Integer(), sa.ForeignKey('key_risk_indicators.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), server_default=func.now(), nullable=False),
        sa.Column('recorded_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('lower_limit', sa.Float(), nullable=False),
        sa.Column('upper_limit', sa.Float(), nullable=False),
        sa.Column('unit', sa.String(50), nullable=False, server_default='%'),
        sa.Column('breach_status', sa.String(10), nullable=False),
    )
    
    # Create indexes for efficient time-series queries
    op.create_index('ix_kri_value_history_kri_id', 'kri_value_history', ['kri_id'])
    op.create_index('ix_kri_value_history_kri_period_end', 'kri_value_history', ['kri_id', 'period_end'])
    op.create_index('ix_kri_value_history_kri_recorded_at', 'kri_value_history', ['kri_id', 'recorded_at'])
    
    # Backfill existing KRIs with sensible defaults
    # Set frequency to 'quarterly' (already done via server_default)
    # Set last_reported_at from last_updated (already done via server_default for NULL)
    # Set last_period_end from date(last_updated)
    op.execute("""
        UPDATE key_risk_indicators 
        SET last_period_end = DATE(COALESCE(last_updated, created_at))
        WHERE last_period_end IS NULL
    """)


def downgrade() -> None:
    # Drop kri_value_history table
    op.drop_index('ix_kri_value_history_kri_recorded_at', table_name='kri_value_history')
    op.drop_index('ix_kri_value_history_kri_period_end', table_name='kri_value_history')
    op.drop_index('ix_kri_value_history_kri_id', table_name='kri_value_history')
    op.drop_table('kri_value_history')
    
    # Drop new columns from key_risk_indicators
    op.drop_index('ix_key_risk_indicators_reporting_owner_id', table_name='key_risk_indicators')
    op.drop_column('key_risk_indicators', 'last_reported_at')
    op.drop_column('key_risk_indicators', 'last_period_end')
    op.drop_column('key_risk_indicators', 'reporting_owner_id')
    op.drop_column('key_risk_indicators', 'frequency')
