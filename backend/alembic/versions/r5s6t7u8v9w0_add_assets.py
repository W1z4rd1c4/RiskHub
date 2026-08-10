"""add assets

ICT Register Asset register (issue #43): the workbook's entered 04_Aktiva
fields (functional reproduction spec section 1.2) plus the ArchivableMixin
soft-delete columns (ADR-005), and the two typed Link relation tables —
Process<->Asset (sheet 05: significance, SPOF, note, and the primary-Process
designation) and Asset<->Asset (sheet 06: directional dependency type, SPOF,
note). Derived fields (CIAA value, weighted score, resulting criticality,
CIF, SPOF rollup, legacy, external dependency, TEXTJOIN aggregates, counts,
completeness) are compute-on-read (ticket #48) and deliberately have no
columns here.

Revision ID: r5s6t7u8v9w0
Revises: q4r5s6t7u8v9
Create Date: 2026-07-10 09:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "r5s6t7u8v9w0"
down_revision: Union[str, Sequence[str], None] = "q4r5s6t7u8v9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("asset_type", sa.String(length=50), nullable=True),
        sa.Column("asset_level", sa.String(length=50), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("physical_location", sa.String(length=255), nullable=True),
        sa.Column("deployment_model", sa.String(length=50), nullable=True),
        sa.Column("alternative_names", sa.String(length=255), nullable=True),
        sa.Column("business_owner", sa.String(length=255), nullable=True),
        sa.Column("owner_department", sa.String(length=100), nullable=True),
        sa.Column("ict_owner", sa.String(length=255), nullable=True),
        sa.Column("gdpr_relevance", sa.String(length=20), nullable=True),
        sa.Column("ai_relevance", sa.String(length=20), nullable=True),
        sa.Column("data_classification", sa.String(length=100), nullable=True),
        sa.Column("confidentiality_rating", sa.Integer(), nullable=True),
        sa.Column("integrity_rating", sa.Integer(), nullable=True),
        sa.Column("availability_rating", sa.Integer(), nullable=True),
        sa.Column("authenticity_rating", sa.Integer(), nullable=True),
        sa.Column("impact_client", sa.Integer(), nullable=True),
        sa.Column("impact_regulatory", sa.Integer(), nullable=True),
        sa.Column("substitutability_rating", sa.Integer(), nullable=True),
        sa.Column("vendor_dependency_rating", sa.Integer(), nullable=True),
        sa.Column("internet_exposed", sa.String(length=10), nullable=True),
        sa.Column("preliminary_criticality", sa.String(length=50), nullable=True),
        sa.Column("lifecycle_state", sa.String(length=50), nullable=True),
        sa.Column("standard_support_end_date", sa.Date(), nullable=True),
        sa.Column("extended_support_end_date", sa.Date(), nullable=True),
        sa.Column("custom_support_end_date", sa.Date(), nullable=True),
        sa.Column("last_legacy_risk_assessment_date", sa.Date(), nullable=True),
        sa.Column("review_state", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["archived_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assets_name"), "assets", ["name"], unique=False)
    op.create_index(op.f("ix_assets_is_archived"), "assets", ["is_archived"], unique=False)

    op.create_table(
        "process_asset_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("process_id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("significance", sa.String(length=50), nullable=True),
        sa.Column("spof", sa.String(length=10), nullable=True),
        sa.Column("is_primary", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("process_id", "asset_id", name="uq_process_asset_link"),
    )
    op.create_index(op.f("ix_process_asset_links_process_id"), "process_asset_links", ["process_id"], unique=False)
    op.create_index(op.f("ix_process_asset_links_asset_id"), "process_asset_links", ["asset_id"], unique=False)
    # DB-level backstop for the at-most-one-primary invariant; declared for
    # both dialects and kept in exact sync with
    # app/models/asset.py ProcessAssetLink.__table_args__.
    op.create_index(
        "uq_process_asset_links_primary_per_asset",
        "process_asset_links",
        ["asset_id"],
        unique=True,
        sqlite_where=sa.text("is_primary"),
        postgresql_where=sa.text("is_primary"),
    )

    op.create_table(
        "asset_asset_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dependent_asset_id", sa.Integer(), nullable=False),
        sa.Column("supporting_asset_id", sa.Integer(), nullable=False),
        sa.Column("dependency_type", sa.String(length=50), nullable=True),
        sa.Column("spof", sa.String(length=10), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["dependent_asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supporting_asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dependent_asset_id", "supporting_asset_id", name="uq_asset_asset_link"),
    )
    op.create_index(
        op.f("ix_asset_asset_links_dependent_asset_id"), "asset_asset_links", ["dependent_asset_id"], unique=False
    )
    op.create_index(
        op.f("ix_asset_asset_links_supporting_asset_id"), "asset_asset_links", ["supporting_asset_id"], unique=False
    )


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
