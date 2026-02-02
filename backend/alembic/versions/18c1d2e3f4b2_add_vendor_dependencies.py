"""add vendor dependencies and relationships

Revision ID: 18c1d2e3f4b2
Revises: 18c1d2e3f4b1
Create Date: 2026-01-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18c1d2e3f4b2"
down_revision: Union[str, Sequence[str], None] = "18c1d2e3f4b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendor_relationships",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("related_vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relationship_type", sa.String(length=50), nullable=False, server_default="subcontractor"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("vendor_id", "related_vendor_id", name="uq_vendor_relationships_edge"),
    )
    op.create_index("ix_vendor_relationships_vendor_id", "vendor_relationships", ["vendor_id"])
    op.create_index("ix_vendor_relationships_related_vendor_id", "vendor_relationships", ["related_vendor_id"])
    op.create_index("ix_vendor_relationships_vendor_related", "vendor_relationships", ["vendor_id", "related_vendor_id"])

    op.create_table(
        "vendor_services",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("service_name", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_vendor_services_vendor_id", "vendor_services", ["vendor_id"])

    op.create_table(
        "vendor_dependencies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_service_id", sa.Integer(), sa.ForeignKey("vendor_services.id", ondelete="CASCADE"), nullable=False),
        sa.Column("risk_id", sa.Integer(), sa.ForeignKey("risks.id"), nullable=True),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id"), nullable=True),
        sa.Column("supported_function_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_vendor_dependencies_vendor_service_id", "vendor_dependencies", ["vendor_service_id"])
    op.create_index("ix_vendor_dependencies_risk_id", "vendor_dependencies", ["risk_id"])
    op.create_index("ix_vendor_dependencies_department_id", "vendor_dependencies", ["department_id"])


def downgrade() -> None:
    op.drop_index("ix_vendor_dependencies_department_id", table_name="vendor_dependencies")
    op.drop_index("ix_vendor_dependencies_risk_id", table_name="vendor_dependencies")
    op.drop_index("ix_vendor_dependencies_vendor_service_id", table_name="vendor_dependencies")
    op.drop_table("vendor_dependencies")
    op.drop_index("ix_vendor_services_vendor_id", table_name="vendor_services")
    op.drop_table("vendor_services")
    op.drop_index("ix_vendor_relationships_vendor_related", table_name="vendor_relationships")
    op.drop_index("ix_vendor_relationships_related_vendor_id", table_name="vendor_relationships")
    op.drop_index("ix_vendor_relationships_vendor_id", table_name="vendor_relationships")
    op.drop_table("vendor_relationships")

