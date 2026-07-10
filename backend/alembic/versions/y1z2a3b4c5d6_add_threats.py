"""add threats

ICT Register Threat register + ICT-risk integration (issue #47): the
workbook's entered 12_Hrozby columns (functional reproduction spec section
1.6) plus the ArchivableMixin soft-delete columns (ADR-005); the three typed
Link relation tables joining the existing Risk register into the register
graph — Threat<->Risk, Risk<->Process, Risk<->Asset (bare unique pairs; the
workbook's 13_Rizika subject and threat references carry no entered link
columns); and the three additive acceptance-governance columns on risks
(13_Rizika block E: akc_schval / akc_oduv / akc_datum). Their
required-together rule is a DQ finding (#50), never a write block, so the
columns are plainly nullable.

Revision ID: y1z2a3b4c5d6
Revises: x1y2z3a4b5c6
Create Date: 2026-07-10 09:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "y1z2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "x1y2z3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "threats",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("typical_weaknesses", sa.Text(), nullable=True),
        sa.Column("relevant_subject", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["archived_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_threats_name"), "threats", ["name"], unique=False)
    op.create_index(op.f("ix_threats_category"), "threats", ["category"], unique=False)
    op.create_index(op.f("ix_threats_is_archived"), "threats", ["is_archived"], unique=False)

    op.create_table(
        "threat_risk_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("threat_id", sa.Integer(), nullable=False),
        sa.Column("risk_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["threat_id"], ["threats.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["risk_id"], ["risks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("threat_id", "risk_id", name="uq_threat_risk_link"),
    )
    op.create_index(op.f("ix_threat_risk_links_threat_id"), "threat_risk_links", ["threat_id"], unique=False)
    op.create_index(op.f("ix_threat_risk_links_risk_id"), "threat_risk_links", ["risk_id"], unique=False)

    op.create_table(
        "risk_process_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("risk_id", sa.Integer(), nullable=False),
        sa.Column("process_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["risk_id"], ["risks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["process_id"], ["processes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("risk_id", "process_id", name="uq_risk_process_link"),
    )
    op.create_index(op.f("ix_risk_process_links_risk_id"), "risk_process_links", ["risk_id"], unique=False)
    op.create_index(op.f("ix_risk_process_links_process_id"), "risk_process_links", ["process_id"], unique=False)

    op.create_table(
        "risk_asset_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("risk_id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["risk_id"], ["risks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("risk_id", "asset_id", name="uq_risk_asset_link"),
    )
    op.create_index(op.f("ix_risk_asset_links_risk_id"), "risk_asset_links", ["risk_id"], unique=False)
    op.create_index(op.f("ix_risk_asset_links_asset_id"), "risk_asset_links", ["asset_id"], unique=False)

    # Additive acceptance-governance columns on the existing risks table.
    op.add_column("risks", sa.Column("acceptance_approver", sa.String(length=255), nullable=True))
    op.add_column("risks", sa.Column("acceptance_justification", sa.Text(), nullable=True))
    op.add_column("risks", sa.Column("acceptance_date", sa.Date(), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
