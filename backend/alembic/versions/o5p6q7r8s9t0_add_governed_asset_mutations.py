"""add governed Asset mutations and Composite impacts

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-07-19 10:00:00.000000

Forward-only per ADR-010 and ADR-016.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o5p6q7r8s9t0"
down_revision: Union[str, Sequence[str], None] = "n4o5p6q7r8s9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_APPROVAL_IDENTITY = (
    "(resource_id IS NULL AND resource_type IN ('PROCESS', 'ASSET') AND action_type = 'CREATE') "
    "OR (resource_id IS NOT NULL AND NOT "
    "(resource_type IN ('PROCESS', 'ASSET') AND action_type = 'CREATE'))"
)
_PROPOSAL_IDENTITY = (
    "(primary_resource_id IS NULL AND ((primary_resource_type = 'process' "
    "AND mutation_kind = 'process.create') OR (primary_resource_type = 'asset' "
    "AND mutation_kind = 'asset.create'))) OR "
    "(primary_resource_id IS NOT NULL AND NOT "
    "((primary_resource_type = 'process' AND mutation_kind = 'process.create') OR "
    "(primary_resource_type = 'asset' AND mutation_kind = 'asset.create')))"
)


def upgrade() -> None:
    dialect = op.get_context().dialect.name
    if dialect == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE approval_resource_type ADD VALUE IF NOT EXISTS 'ASSET'")

    op.add_column(
        "assets",
        sa.Column("governance_version", sa.Integer(), nullable=False, server_default="1"),
    )

    if dialect == "sqlite":
        with op.batch_alter_table("approval_requests") as batch_op:
            batch_op.drop_constraint("ck_approval_requests_process_create_resource_identity", type_="check")
            batch_op.alter_column(
                "resource_type",
                existing_type=sa.Enum(
                    "RISK",
                    "CONTROL",
                    "KRI",
                    "PROCESS",
                    name="approval_resource_type",
                    create_constraint=True,
                ),
                type_=sa.Enum(
                    "RISK",
                    "CONTROL",
                    "KRI",
                    "PROCESS",
                    "ASSET",
                    name="approval_resource_type",
                    create_constraint=True,
                ),
                nullable=False,
            )
            batch_op.create_check_constraint(
                "ck_approval_requests_process_create_resource_identity",
                _APPROVAL_IDENTITY,
            )
        with op.batch_alter_table("governed_mutation_proposals") as batch_op:
            batch_op.drop_constraint("ck_governed_mutation_process_create_resource_identity", type_="check")
            batch_op.create_check_constraint(
                "ck_governed_mutation_process_create_resource_identity",
                _PROPOSAL_IDENTITY,
            )
    else:
        op.drop_constraint(
            "ck_approval_requests_process_create_resource_identity",
            "approval_requests",
            type_="check",
        )
        op.create_check_constraint(
            "ck_approval_requests_process_create_resource_identity",
            "approval_requests",
            _APPROVAL_IDENTITY,
        )
        op.drop_constraint(
            "ck_governed_mutation_process_create_resource_identity",
            "governed_mutation_proposals",
            type_="check",
        )
        op.create_check_constraint(
            "ck_governed_mutation_process_create_resource_identity",
            "governed_mutation_proposals",
            _PROPOSAL_IDENTITY,
        )

    op.execute(
        sa.text(
            """
            INSERT INTO approval_scenarios
                (key, display_name, description, requires_approval, approver_roles)
            SELECT
                'protected_asset_edit',
                'Protected Asset mutations',
                'Independent approval for CIF or Critical Asset mutations',
                true,
                :roles
            WHERE NOT EXISTS (
                SELECT 1 FROM approval_scenarios WHERE key = 'protected_asset_edit'
            )
            """
        ).bindparams(
            sa.bindparam(
                "roles",
                value=["risk_manager", "cro"],
                type_=sa.JSON(),
            )
        )
    )


def downgrade() -> None:
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
