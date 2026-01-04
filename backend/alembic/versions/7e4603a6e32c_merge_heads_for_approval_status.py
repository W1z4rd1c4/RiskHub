"""merge_heads_for_approval_status

Revision ID: 7e4603a6e32c
Revises: a9b8c7d6e5f4, b8c3d2e1f4a5, cfd46dc4cb71
Create Date: 2026-01-04 18:37:06.989983

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e4603a6e32c'
down_revision: Union[str, Sequence[str], None] = ('a9b8c7d6e5f4', 'b8c3d2e1f4a5', 'cfd46dc4cb71')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
