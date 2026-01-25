"""add vendor risk factors and link tables

Revision ID: 18c1d2e3f4a5
Revises: 18b1c2d3e4f5
Create Date: 2026-01-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18c1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "18b1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_risk_factors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("category_key", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vendor_risk_factors_category_key"), "vendor_risk_factors", ["category_key"], unique=False)
    op.create_index(op.f("ix_vendor_risk_factors_vendor_id"), "vendor_risk_factors", ["vendor_id"], unique=False)

    op.create_table(
        "vendor_risk_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("risk_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["risk_id"], ["risks.id"]),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vendor_id", "risk_id", name="uq_vendor_risk_link"),
    )
    op.create_index(op.f("ix_vendor_risk_links_risk_id"), "vendor_risk_links", ["risk_id"], unique=False)
    op.create_index(op.f("ix_vendor_risk_links_vendor_id"), "vendor_risk_links", ["vendor_id"], unique=False)

    op.create_table(
        "vendor_control_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("control_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["control_id"], ["controls.id"]),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vendor_id", "control_id", name="uq_vendor_control_link"),
    )
    op.create_index(op.f("ix_vendor_control_links_control_id"), "vendor_control_links", ["control_id"], unique=False)
    op.create_index(op.f("ix_vendor_control_links_vendor_id"), "vendor_control_links", ["vendor_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_vendor_control_links_vendor_id"), table_name="vendor_control_links")
    op.drop_index(op.f("ix_vendor_control_links_control_id"), table_name="vendor_control_links")
    op.drop_table("vendor_control_links")
    op.drop_index(op.f("ix_vendor_risk_links_vendor_id"), table_name="vendor_risk_links")
    op.drop_index(op.f("ix_vendor_risk_links_risk_id"), table_name="vendor_risk_links")
    op.drop_table("vendor_risk_links")
    op.drop_index(op.f("ix_vendor_risk_factors_vendor_id"), table_name="vendor_risk_factors")
    op.drop_index(op.f("ix_vendor_risk_factors_category_key"), table_name="vendor_risk_factors")
    op.drop_table("vendor_risk_factors")

