"""extend governed Process mutation kinds

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-07-17 08:00:00.000000

Forward-only per ADR-010 and ADR-016.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "n4o5p6q7r8s9"
down_revision: Union[str, Sequence[str], None] = "m3n4o5p6q7r8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    dialect = op.get_context().dialect.name
    if dialect == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE approval_action_type ADD VALUE IF NOT EXISTS 'CREATE'")
    if dialect == "sqlite":
        with op.batch_alter_table("approval_requests") as batch_op:
            batch_op.alter_column("resource_id", existing_type=sa.Integer(), nullable=True)
            batch_op.alter_column(
                "action_type",
                existing_type=sa.Enum(
                    "DELETE",
                    "EDIT",
                    name="approval_action_type",
                    create_constraint=True,
                ),
                type_=sa.Enum(
                    "DELETE",
                    "EDIT",
                    "CREATE",
                    name="approval_action_type",
                    create_constraint=True,
                ),
                nullable=False,
            )
            batch_op.create_check_constraint(
                "ck_approval_requests_process_create_resource_identity",
                "(resource_id IS NULL AND resource_type = 'PROCESS' AND action_type = 'CREATE') "
                "OR (resource_id IS NOT NULL AND NOT "
                "(resource_type = 'PROCESS' AND action_type = 'CREATE'))",
            )
        with op.batch_alter_table("governed_mutation_proposals") as batch_op:
            batch_op.alter_column("primary_resource_id", existing_type=sa.Integer(), nullable=True)
            batch_op.create_check_constraint(
                "ck_governed_mutation_process_create_resource_identity",
                "(primary_resource_id IS NULL AND primary_resource_type = 'process' "
                "AND mutation_kind = 'process.create') OR "
                "(primary_resource_id IS NOT NULL AND NOT "
                "(primary_resource_type = 'process' AND mutation_kind = 'process.create'))",
            )
    else:
        op.alter_column(
            "approval_requests",
            "resource_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
        op.alter_column(
            "governed_mutation_proposals",
            "primary_resource_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
        op.create_check_constraint(
            "ck_approval_requests_process_create_resource_identity",
            "approval_requests",
            "(resource_id IS NULL AND resource_type = 'PROCESS' AND action_type = 'CREATE') "
            "OR (resource_id IS NOT NULL AND NOT "
            "(resource_type = 'PROCESS' AND action_type = 'CREATE'))",
        )
        op.create_check_constraint(
            "ck_governed_mutation_process_create_resource_identity",
            "governed_mutation_proposals",
            "(primary_resource_id IS NULL AND primary_resource_type = 'process' "
            "AND mutation_kind = 'process.create') OR "
            "(primary_resource_id IS NOT NULL AND NOT "
            "(primary_resource_type = 'process' AND mutation_kind = 'process.create'))",
        )


def downgrade() -> None:
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
