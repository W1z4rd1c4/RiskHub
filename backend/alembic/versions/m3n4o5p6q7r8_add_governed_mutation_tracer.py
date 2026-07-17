"""add governed mutation proposal and Process tracer

Revision ID: m3n4o5p6q7r8
Revises: k2f3g4h5i6j7
Create Date: 2026-07-16 19:20:00.000000

Forward-only per ADR-010 and ADR-016.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m3n4o5p6q7r8"
down_revision: Union[str, Sequence[str], None] = "k2f3g4h5i6j7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GOVERNED_MUTATION_SNAPSHOT_TYPE = sa.JSON().with_variant(
    postgresql.JSONB(), "postgresql"
)


def upgrade() -> None:
    dialect = op.get_context().dialect.name
    if dialect == "postgresql":
        op.execute("ALTER TYPE approval_resource_type ADD VALUE IF NOT EXISTS 'PROCESS'")
        op.execute("ALTER TYPE approval_status ADD VALUE IF NOT EXISTS 'EXPIRED'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GOVERNED_APPROVAL_ACTION_REQUIRED'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GOVERNED_APPROVAL_REQUEST_UPDATES'")

    op.add_column(
        "processes",
        sa.Column("governance_version", sa.Integer(), nullable=False, server_default="1"),
    )

    op.create_table(
        "governed_mutation_proposals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("proposal_id", sa.String(length=36), nullable=False),
        sa.Column("proposal_version", sa.Integer(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("approval_request_id", sa.Integer(), nullable=False),
        sa.Column("mutation_kind", sa.String(length=50), nullable=False),
        sa.Column("primary_resource_type", sa.String(length=50), nullable=False),
        sa.Column("primary_resource_id", sa.Integer(), nullable=False),
        sa.Column("primary_resource_name", sa.String(length=255), nullable=False),
        sa.Column("scenario_snapshot", GOVERNED_MUTATION_SNAPSHOT_TYPE, nullable=False),
        sa.Column("base_versions", GOVERNED_MUTATION_SNAPSHOT_TYPE, nullable=False),
        sa.Column("before_snapshot", GOVERNED_MUTATION_SNAPSHOT_TYPE, nullable=False),
        sa.Column("after_snapshot", GOVERNED_MUTATION_SNAPSHOT_TYPE, nullable=False),
        sa.Column("derived_impact_snapshot", GOVERNED_MUTATION_SNAPSHOT_TYPE, nullable=False),
        sa.Column("proposed_changes", GOVERNED_MUTATION_SNAPSHOT_TYPE, nullable=False),
        sa.Column("impacted_resources_snapshot", GOVERNED_MUTATION_SNAPSHOT_TYPE, nullable=False),
        sa.Column("requested_by_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["approval_request_id"], ["approval_requests.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["requested_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("approval_request_id"),
    )
    op.create_index(
        "ix_governed_mutation_proposals_proposal_id",
        "governed_mutation_proposals",
        ["proposal_id"],
    )
    op.create_index(
        "ux_governed_mutation_proposal_version",
        "governed_mutation_proposals",
        ["proposal_id", "proposal_version"],
        unique=True,
    )
    if dialect == "postgresql":
        op.execute(
            """
            CREATE FUNCTION reject_governed_mutation_proposal_mutation()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RAISE EXCEPTION 'governed mutation proposals are immutable after insertion'
                    USING ERRCODE = '55000';
            END;
            $$
            """
        )
        op.execute(
            """
            CREATE TRIGGER governed_mutation_proposals_insert_only
            BEFORE UPDATE OR DELETE ON governed_mutation_proposals
            FOR EACH ROW
            EXECUTE FUNCTION reject_governed_mutation_proposal_mutation()
            """
        )

    op.create_table(
        "governed_mutation_impact_locks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("proposal_id", sa.Integer(), nullable=False),
        sa.Column("resource_type", sa.String(length=50), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=False),
        sa.Column("base_governance_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("release_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["proposal_id"], ["governed_mutation_proposals.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_governed_mutation_impact_locks_proposal_id",
        "governed_mutation_impact_locks",
        ["proposal_id"],
    )
    op.create_index(
        "ix_governed_mutation_impact_resource",
        "governed_mutation_impact_locks",
        ["resource_type", "resource_id"],
    )
    op.create_index(
        "ux_governed_mutation_active_impact",
        "governed_mutation_impact_locks",
        ["resource_type", "resource_id"],
        unique=True,
        postgresql_where=sa.text("released_at IS NULL"),
        sqlite_where=sa.text("released_at IS NULL"),
    )

    op.execute(
        """
        INSERT INTO approval_scenarios
            (key, display_name, description, requires_approval, approver_roles)
        SELECT
            'protected_process_edit',
            'Protected Process edit',
            'Business-data edits where current or proposed Process CIF is Yes',
            true,
            '["risk_manager", "cro"]'
        WHERE NOT EXISTS (
            SELECT 1 FROM approval_scenarios WHERE key = 'protected_process_edit'
        )
        """
    )


def downgrade() -> None:
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
