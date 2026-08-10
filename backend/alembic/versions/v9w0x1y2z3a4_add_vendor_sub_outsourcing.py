"""add vendor sub-outsourcing

ICT Register Sub-outsourcing chains under Vendor (issue #45): the
``vendor_sub_outsourcing`` table carries the workbook's entered 09_Subdodávky
columns (functional reproduction spec section 1.5) plus the ArchivableMixin
soft-delete columns (ADR-005). One row = one link in a sub-outsourcing chain,
scoped to a Contract of the same Vendor: ``contract_id`` is required (every
chain hangs off a Contract) and a NULL ``predecessor_id`` self-reference
marks a direct sub-outsourcer of the Contract. The sub-provider identity is
stored inline (name, TypKodu identifier type + value, ZemeList country).
Derived columns (Rank recursion, lookups, the duplicate/chain-error check,
hidden helpers) are compute-on-read (ticket #49) and deliberately have no
columns here.

No permission-sync migration accompanies this slice: authorization reuses
the ``vendor_contracts`` resource (the same governed surface — the
fourth-party contract chain), so no new permission rows exist to backfill.

Revision ID: v9w0x1y2z3a4
Revises: u8v9w0x1y2z3
Create Date: 2026-07-10 16:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "v9w0x1y2z3a4"
down_revision: Union[str, Sequence[str], None] = "u8v9w0x1y2z3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_sub_outsourcing",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("predecessor_id", sa.Integer(), nullable=True),
        sa.Column("sub_provider_name", sa.String(length=255), nullable=True),
        sa.Column("identifier_type", sa.String(length=20), nullable=True),
        sa.Column("identifier_value", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("ict_service_code", sa.String(length=3), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["vendor_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["predecessor_id"], ["vendor_sub_outsourcing.id"]),
        sa.ForeignKeyConstraint(["archived_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_vendor_sub_outsourcing_vendor_id"), "vendor_sub_outsourcing", ["vendor_id"], unique=False
    )
    op.create_index(
        op.f("ix_vendor_sub_outsourcing_contract_id"),
        "vendor_sub_outsourcing",
        ["contract_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_vendor_sub_outsourcing_predecessor_id"),
        "vendor_sub_outsourcing",
        ["predecessor_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_vendor_sub_outsourcing_is_archived"),
        "vendor_sub_outsourcing",
        ["is_archived"],
        unique=False,
    )


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
