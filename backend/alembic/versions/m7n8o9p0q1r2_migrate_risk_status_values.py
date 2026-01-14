"""Migrate risk status to 3 values: active, emerging, archived

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-01-14

Maps:
- monitoring -> emerging
- closed -> archived
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'm7n8o9p0q1r2'
down_revision = 'l6m7n8o9p0q1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Map old status values to new ones
    # monitoring -> emerging (semantic rename for market/country risks)
    # closed -> archived (merge into existing soft-delete)
    op.execute("""
        UPDATE risks 
        SET status = 'emerging' 
        WHERE status = 'monitoring'
    """)
    
    op.execute("""
        UPDATE risks 
        SET status = 'archived' 
        WHERE status = 'closed'
    """)


def downgrade() -> None:
    # Reverse the mapping
    # emerging -> monitoring
    # (archived stays archived since it existed before)
    op.execute("""
        UPDATE risks 
        SET status = 'monitoring' 
        WHERE status = 'emerging'
    """)
