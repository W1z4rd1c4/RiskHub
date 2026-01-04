"""add_activity_log_enum_constraints

Revision ID: b8c3d2e1f4a5
Revises: a999fbda07ce
Create Date: 2026-01-04 01:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b8c3d2e1f4a5"
down_revision: Union[str, Sequence[str], None] = "a999fbda07ce"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    activity_entity_enum = sa.Enum(
        "risk",
        "control",
        "kri",
        "user",
        "department",
        "approval",
        "control_execution",
        "kri_value",
        "control_risk_link",
        "role",
        "config",
        name="activity_entity_type",
        native_enum=False,
    )
    activity_action_enum = sa.Enum(
        "create",
        "update",
        "delete",
        "archive",
        "approve",
        "reject",
        "status_change",
        "link",
        "unlink",
        "login",
        "failed_login",
        name="activity_action",
        native_enum=False,
    )
    with op.batch_alter_table("activity_logs", schema=None) as batch_op:
        batch_op.alter_column(
            "entity_type",
            existing_type=sa.String(length=50),
            type_=activity_entity_enum,
            existing_nullable=False,
        )
        batch_op.alter_column(
            "action",
            existing_type=sa.String(length=50),
            type_=activity_action_enum,
            existing_nullable=False,
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("activity_logs", schema=None) as batch_op:
        batch_op.alter_column(
            "action",
            existing_type=sa.Enum(name="activity_action", native_enum=False),
            type_=sa.String(length=50),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "entity_type",
            existing_type=sa.Enum(name="activity_entity_type", native_enum=False),
            type_=sa.String(length=50),
            existing_nullable=False,
        )
