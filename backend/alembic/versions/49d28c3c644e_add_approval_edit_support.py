"""add_approval_edit_support

Revision ID: 49d28c3c644e
Revises: 1b8059476a03
Create Date: 2025-12-27 23:06:24.077476

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '49d28c3c644e'
down_revision: Union[str, Sequence[str], None] = '1b8059476a03'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create the enum type first
    approval_action_type = sa.Enum('DELETE', 'EDIT', name='approval_action_type', create_type=True)
    approval_action_type.create(op.get_bind(), checkfirst=True)
    
    # Add column with server_default for existing rows
    op.add_column('approval_requests', sa.Column('action_type', 
        sa.Enum('DELETE', 'EDIT', name='approval_action_type', create_constraint=True),
        nullable=False, server_default='DELETE'))
    op.add_column('approval_requests', sa.Column('pending_changes', sa.Text(), nullable=True))
    op.create_index('ix_approval_action_type', 'approval_requests', ['action_type'], unique=False)
    
    # Remove server_default after populating existing rows
    op.alter_column('approval_requests', 'action_type', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_approval_action_type', table_name='approval_requests')
    op.drop_column('approval_requests', 'pending_changes')
    op.drop_column('approval_requests', 'action_type')
    
    # Drop the enum type
    approval_action_type = sa.Enum('DELETE', 'EDIT', name='approval_action_type')
    approval_action_type.drop(op.get_bind(), checkfirst=True)

