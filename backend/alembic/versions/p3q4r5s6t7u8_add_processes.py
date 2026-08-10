"""add processes

ICT Register Process register (issue #42): the workbook's entered 03_Procesy
fields (functional reproduction spec section 1.1) plus the ArchivableMixin
soft-delete columns (ADR-005) and the stable RoI F-code assigned at creation.
Derived fields (score, class, CIF, gap checks, next review, counts,
completeness) are compute-on-read (ticket #48) and deliberately have no
columns here.

Revision ID: p3q4r5s6t7u8
Revises: o2p3q4r5s6t7
Create Date: 2026-07-09 21:10:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "p3q4r5s6t7u8"
down_revision: Union[str, Sequence[str], None] = "o2p3q4r5s6t7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "processes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("f_code", sa.String(length=20), nullable=False),
        sa.Column("l0_area", sa.String(length=255), nullable=False),
        sa.Column("l1_process", sa.String(length=255), nullable=False),
        sa.Column("l2_subprocess", sa.String(length=255), nullable=True),
        sa.Column("owner", sa.String(length=255), nullable=True),
        sa.Column("owner_department", sa.String(length=100), nullable=True),
        sa.Column("impact_client", sa.Integer(), nullable=True),
        sa.Column("impact_market_operations", sa.Integer(), nullable=True),
        sa.Column("impact_regulatory", sa.Integer(), nullable=True),
        sa.Column("impact_financial", sa.Integer(), nullable=True),
        sa.Column("impact_reputational", sa.Integer(), nullable=True),
        sa.Column("mtpd_hours", sa.Integer(), nullable=True),
        sa.Column("preliminary_criticality", sa.String(length=50), nullable=True),
        sa.Column("cif_override", sa.String(length=10), nullable=True),
        sa.Column("licensed_activity", sa.String(length=100), nullable=True),
        sa.Column("rto_hours", sa.Integer(), nullable=True),
        sa.Column("rpo_hours", sa.Integer(), nullable=True),
        sa.Column("bcm_link", sa.String(length=50), nullable=True),
        sa.Column("last_dr_test_date", sa.Date(), nullable=True),
        sa.Column("dr_test_result", sa.String(length=50), nullable=True),
        sa.Column("interruption_impact", sa.String(length=50), nullable=True),
        sa.Column("assessment_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["archived_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_processes_f_code"), "processes", ["f_code"], unique=True)
    op.create_index(op.f("ix_processes_l0_area"), "processes", ["l0_area"], unique=False)
    op.create_index(op.f("ix_processes_l1_process"), "processes", ["l1_process"], unique=False)
    op.create_index(op.f("ix_processes_is_archived"), "processes", ["is_archived"], unique=False)


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
