"""Expand activity action constraint for auth session events.

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-04-20

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "z6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "y5z6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Expand activity_logs.action to the full current enum set."""
    activity_action_enum = sa.Enum(
        "create",
        "update",
        "delete",
        "archive",
        "approve",
        "reject",
        "escalate",
        "status_change",
        "link",
        "unlink",
        "login",
        "failed_login",
        "refresh",
        "failed_refresh",
        "logout",
        "logout_all",
        "cancel",
        name="activity_action",
        native_enum=False,
    )
    with op.batch_alter_table("activity_logs", schema=None) as batch_op:
        batch_op.alter_column(
            "action",
            existing_type=sa.Enum(name="activity_action", native_enum=False),
            type_=activity_action_enum,
            existing_nullable=False,
        )


def downgrade() -> None:
    """Downgrade to an unconstrained string to preserve rows with newer action values."""
    with op.batch_alter_table("activity_logs", schema=None) as batch_op:
        batch_op.alter_column(
            "action",
            existing_type=sa.Enum(name="activity_action", native_enum=False),
            type_=sa.String(length=50),
            existing_nullable=False,
        )
