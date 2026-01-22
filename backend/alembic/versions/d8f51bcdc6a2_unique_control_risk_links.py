"""unique_control_risk_links

Revision ID: d8f51bcdc6a2
Revises: o9p0q1r2s3t4
Create Date: 2026-01-22 23:16:39.933194

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8f51bcdc6a2'
down_revision: Union[str, Sequence[str], None] = 'o9p0q1r2s3t4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add unique constraint on control_risk_links(control_id, risk_id).
    
    First deduplicates existing rows (keeping lowest id per pair),
    then creates the unique index.
    """
    # Step 1: Deduplicate existing rows (keep minimum id for each control_id, risk_id pair)
    # This SQL is SQLite and PostgreSQL compatible
    conn = op.get_bind()
    
    # Find duplicates and delete all but the first (lowest id)
    conn.execute(sa.text("""
        DELETE FROM control_risk_links 
        WHERE id NOT IN (
            SELECT MIN(id) 
            FROM control_risk_links 
            GROUP BY control_id, risk_id
        )
    """))
    
    # Step 2: Create unique index
    op.create_unique_constraint(
        'ux_control_risk_links_control_risk',
        'control_risk_links',
        ['control_id', 'risk_id']
    )


def downgrade() -> None:
    """Remove unique constraint."""
    op.drop_constraint(
        'ux_control_risk_links_control_risk',
        'control_risk_links',
        type_='unique'
    )
