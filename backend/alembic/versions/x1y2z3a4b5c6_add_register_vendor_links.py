"""add register vendor links

ICT Register Asset<->Vendor and Process<->Vendor Link relations (issue #46):
the two remaining manual link sheets of the register graph. asset_vendor_links
carries the entered 10_VAD columns — vendor role, the ICT service S-code
(part of the identity tuple), contract reference, reliance, note — unique per
(asset, vendor, S-code). process_vendor_links carries the entered sheet 11 §1
columns — direct-service description, note — unique per (process, vendor);
the §2 transitive expansion is derived on read and never persisted. Derived
lookup/helper columns deliberately have no columns here (compute-on-read).
No permission-sync migration ships: mutations reuse assets:write /
processes:write, reads reuse the existing read permissions.

Revision ID: x1y2z3a4b5c6
Revises: w0x1y2z3a4b5
Create Date: 2026-07-10 12:45:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "x1y2z3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "w0x1y2z3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_vendor_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("vendor_role", sa.String(length=50), nullable=True),
        sa.Column("ict_service_code", sa.String(length=3), nullable=False),
        sa.Column("contract_reference", sa.String(length=100), nullable=True),
        sa.Column("reliance", sa.String(length=50), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id", "vendor_id", "ict_service_code", name="uq_asset_vendor_link"),
    )
    op.create_index(op.f("ix_asset_vendor_links_asset_id"), "asset_vendor_links", ["asset_id"], unique=False)
    op.create_index(op.f("ix_asset_vendor_links_vendor_id"), "asset_vendor_links", ["vendor_id"], unique=False)

    op.create_table(
        "process_vendor_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("process_id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("direct_service_description", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("process_id", "vendor_id", name="uq_process_vendor_link"),
    )
    op.create_index(
        op.f("ix_process_vendor_links_process_id"), "process_vendor_links", ["process_id"], unique=False
    )
    op.create_index(
        op.f("ix_process_vendor_links_vendor_id"), "process_vendor_links", ["vendor_id"], unique=False
    )


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
