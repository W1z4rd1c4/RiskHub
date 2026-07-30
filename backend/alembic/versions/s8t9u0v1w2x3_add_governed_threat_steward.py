"""add governed Threat Steward accountability

Revision ID: s8t9u0v1w2x3
Revises: r7s8t9u0v1w2
Create Date: 2026-07-30 13:00:00.000000

Forward-only per ADR-010 and ADR-016.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s8t9u0v1w2x3"
down_revision: Union[str, Sequence[str], None] = "r7s8t9u0v1w2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    dialect = op.get_context().dialect.name
    if dialect == "postgresql":
        with op.get_context().autocommit_block():
            op.execute(
                "ALTER TYPE approval_resource_type "
                "ADD VALUE IF NOT EXISTS 'THREAT'"
            )

    op.add_column(
        "threats",
        sa.Column(
            "governance_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )

    if dialect == "sqlite":
        with op.batch_alter_table("approval_requests") as batch_op:
            batch_op.alter_column(
                "resource_type",
                existing_type=sa.Enum(
                    "RISK",
                    "CONTROL",
                    "KRI",
                    "PROCESS",
                    "ASSET",
                    "VENDOR",
                    name="approval_resource_type",
                    create_constraint=True,
                ),
                type_=sa.Enum(
                    "RISK",
                    "CONTROL",
                    "KRI",
                    "PROCESS",
                    "ASSET",
                    "VENDOR",
                    "THREAT",
                    name="approval_resource_type",
                    create_constraint=True,
                ),
                nullable=False,
            )


def downgrade() -> None:
    raise NotImplementedError(
        "Forward-only migration. Restore from snapshot per ADR-010."
    )
