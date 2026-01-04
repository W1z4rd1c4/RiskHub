"""add quarterly metric snapshots table

Revision ID: g1h2i3j4k5l6
Revises: cfd46dc4cb71
Create Date: 2026-01-04

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'g1h2i3j4k5l6'
down_revision = '7e4603a6e32c'
branch_labels = None
depends_on = None


def upgrade():
    # Create the quarterly_metric_snapshots table
    op.create_table(
        'quarterly_metric_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('quarter', sa.String(length=10), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('quarter_number', sa.Integer(), nullable=False),
        sa.Column('snapshot_type', sa.Enum('quarter_end', 'manual', name='snapshottype'), nullable=False),
        sa.Column('captured_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('department_id', sa.Integer(), nullable=True),
        sa.Column('metrics', sa.JSON(), nullable=False),
        sa.Column('captured_by_user_id', sa.Integer(), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_quarterly_metric_snapshots_id'), 'quarterly_metric_snapshots', ['id'], unique=False)
    op.create_index(op.f('ix_quarterly_metric_snapshots_quarter'), 'quarterly_metric_snapshots', ['quarter'], unique=False)
    op.create_index(op.f('ix_quarterly_metric_snapshots_department_id'), 'quarterly_metric_snapshots', ['department_id'], unique=False)
    op.create_index('ix_quarterly_snapshot_unique', 'quarterly_metric_snapshots', ['quarter', 'department_id'], unique=True)
    op.create_index('ix_quarterly_snapshot_year_quarter', 'quarterly_metric_snapshots', ['year', 'quarter_number'], unique=False)


def downgrade():
    op.drop_index('ix_quarterly_snapshot_year_quarter', table_name='quarterly_metric_snapshots')
    op.drop_index('ix_quarterly_snapshot_unique', table_name='quarterly_metric_snapshots')
    op.drop_index(op.f('ix_quarterly_metric_snapshots_department_id'), table_name='quarterly_metric_snapshots')
    op.drop_index(op.f('ix_quarterly_metric_snapshots_quarter'), table_name='quarterly_metric_snapshots')
    op.drop_index(op.f('ix_quarterly_metric_snapshots_id'), table_name='quarterly_metric_snapshots')
    op.drop_table('quarterly_metric_snapshots')
    
    # Drop enum type
    sa.Enum(name='snapshottype').drop(op.get_bind(), checkfirst=True)
