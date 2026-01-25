"""Extend activity_entity_type for vendor entities.

Revision ID: 18b1c2d3e4f5
Revises: 18a1b2c3d4e5
Create Date: 2026-01-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18b1c2d3e4f5"
down_revision: Union[str, Sequence[str], None] = "18a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    activity_entity_enum = sa.Enum(
        "risk",
        "control",
        "kri",
        "risk_questionnaire",
        "vendor",
        "vendor_assessment",
        "vendor_incident",
        "vendor_sla",
        "vendor_remediation",
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

    with op.batch_alter_table("activity_logs", schema=None) as batch_op:
        batch_op.alter_column(
            "entity_type",
            existing_type=sa.Enum(name="activity_entity_type", native_enum=False),
            type_=activity_entity_enum,
            existing_nullable=False,
        )


def downgrade() -> None:
    """Cannot safely remove enum values in SQLite batch migrations - no-op."""
    return None

