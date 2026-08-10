"""add vendor contracts

ICT Register Vendor Contracts + vendor register extension (issue #44): the
``vendor_contracts`` table carries the workbook's entered 08_Smlouvy columns
(functional reproduction spec section 1.4) plus the ArchivableMixin
soft-delete columns (ADR-005); the ``vendors`` table gains the entered
07_Dodavatelé register columns the base model lacked (spec section 1.3),
including the LEI/EUID identifier type + value pair. Derived columns
(vendor-name lookup, chain display, duplicate check, hidden helpers, CIF,
tier, counts, completeness, country category) are compute-on-read (tickets
#48/#49) and deliberately have no columns here.

``vendors.replaceability`` becomes the register's Substitutability input:
the column is widened for the closed four-value ``Substituce`` vocabulary
(up to 28 characters) while existing stored values stay untouched — no data
migration of legacy easy/medium/hard rows.

Revision ID: t7u8v9w0x1y2
Revises: s6t7u8v9w0x1
Create Date: 2026-07-10 15:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "t7u8v9w0x1y2"
down_revision: Union[str, Sequence[str], None] = "s6t7u8v9w0x1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_contracts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("contract_reference", sa.String(length=100), nullable=True),
        sa.Column("internal_contract_number", sa.String(length=100), nullable=True),
        sa.Column("records_system", sa.String(length=20), nullable=True),
        sa.Column("arrangement_type", sa.String(length=50), nullable=True),
        sa.Column("main_contract", sa.String(length=10), nullable=True),
        sa.Column("overarching_arrangement_reference", sa.String(length=100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("roi_scope", sa.String(length=10), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("notice_period_entity_days", sa.Integer(), nullable=True),
        sa.Column("notice_period_provider_days", sa.Integer(), nullable=True),
        sa.Column("governing_law_country", sa.String(length=2), nullable=True),
        sa.Column("annual_cost", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["archived_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vendor_contracts_vendor_id"), "vendor_contracts", ["vendor_id"], unique=False)
    op.create_index(op.f("ix_vendor_contracts_is_archived"), "vendor_contracts", ["is_archived"], unique=False)

    # Substituce values exceed the legacy String(20); widen without rewriting
    # rows. Batch mode per repo convention for type changes (SQLite has no
    # in-place ALTER COLUMN; precedent: 18b1c2d3e4f5).
    with op.batch_alter_table("vendors", schema=None) as batch_op:
        batch_op.alter_column(
            "replaceability",
            existing_type=sa.String(length=20),
            type_=sa.String(length=50),
            existing_nullable=True,
        )

    # A·IDENTIFIKACE
    op.add_column("vendors", sa.Column("latin_name", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("person_type", sa.String(length=50), nullable=True))
    op.add_column("vendors", sa.Column("identifier_type", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("identifier_value", sa.String(length=100), nullable=True))
    op.add_column("vendors", sa.Column("address", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("contact_person", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("contact", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("ultimate_parent_name", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("ultimate_parent_lei", sa.String(length=50), nullable=True))

    # C·DATA A LOKACE
    op.add_column("vendors", sa.Column("data_storage", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("service_country", sa.String(length=100), nullable=True))
    op.add_column("vendors", sa.Column("data_location", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("processing_location", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("data_sensitivity", sa.String(length=20), nullable=True))

    # D·SUBSTITUCE A EXIT
    op.add_column("vendors", sa.Column("substitutability_reason", sa.String(length=50), nullable=True))
    op.add_column("vendors", sa.Column("last_audit_date", sa.Date(), nullable=True))
    op.add_column("vendors", sa.Column("exit_plan_state", sa.String(length=50), nullable=True))
    op.add_column("vendors", sa.Column("reintegration", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("service_disruption_impact", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("alternative_providers", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("alternative_providers_names", sa.String(length=255), nullable=True))

    # F·POSOUZENÍ RIZIKA A VÝZNAMNOSTI
    op.add_column("vendors", sa.Column("ctpp_designation", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_operational", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_legal", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_ict", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_reputational", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_data_confidentiality", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_data_availability", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_data_location", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_provider_location", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_ict_concentration", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("ex_ante_assessment_date", sa.Date(), nullable=True))
    op.add_column("vendors", sa.Column("assessment_phase", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("due_diligence_state", sa.String(length=50), nullable=True))
    op.add_column("vendors", sa.Column("last_monitoring_date", sa.Date(), nullable=True))
    op.add_column("vendors", sa.Column("significance_authorization_conditions", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("significance_regulatory_requirements", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("significance_service_quality", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("significance_financial_impact", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("significance_reputation_continuity", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("significance_cumulative_impact", sa.String(length=20), nullable=True))
    op.add_column("vendors", sa.Column("significance_justification", sa.Text(), nullable=True))

    # G·STAV A POZNÁMKY
    op.add_column("vendors", sa.Column("note", sa.Text(), nullable=True))
    op.add_column("vendors", sa.Column("reference_occurrence_count", sa.Integer(), nullable=True))
    op.add_column("vendors", sa.Column("reference_process_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
