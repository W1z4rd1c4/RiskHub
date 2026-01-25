"""add vendors

Revision ID: 18a1b2c3d4e5
Revises: d18e00a1b2c3
Create Date: 2026-01-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "18a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "d18e00a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("legal_name", sa.String(length=255), nullable=True),
        sa.Column("registration_id", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("website", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("process", sa.String(length=255), nullable=False),
        sa.Column("subprocess", sa.String(length=255), nullable=True),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("outsourcing_owner_user_id", sa.Integer(), nullable=False),
        sa.Column("vendor_type", sa.String(length=50), nullable=False),
        sa.Column("risk_score_1_5", sa.Integer(), nullable=False),
        sa.Column("supports_important_core_insurance_function", sa.Boolean(), nullable=False),
        sa.Column("dora_relevant", sa.Boolean(), nullable=False),
        sa.Column("is_significant_vendor", sa.Boolean(), nullable=False),
        sa.Column("materiality_assessed_max_impact_pct_own_funds", sa.Numeric(6, 2), nullable=True),
        sa.Column("replaceability", sa.String(length=20), nullable=True),
        sa.Column("has_alternative_providers", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"]),
        sa.ForeignKeyConstraint(["outsourcing_owner_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vendors_department_id"), "vendors", ["department_id"], unique=False)
    op.create_index(op.f("ix_vendors_name"), "vendors", ["name"], unique=False)
    op.create_index(op.f("ix_vendors_outsourcing_owner_user_id"), "vendors", ["outsourcing_owner_user_id"], unique=False)
    op.create_index(op.f("ix_vendors_process"), "vendors", ["process"], unique=False)
    op.create_index(op.f("ix_vendors_registration_id"), "vendors", ["registration_id"], unique=False)
    op.create_index(op.f("ix_vendors_status"), "vendors", ["status"], unique=False)
    op.create_index(op.f("ix_vendors_subprocess"), "vendors", ["subprocess"], unique=False)
    op.create_index(op.f("ix_vendors_vendor_type"), "vendors", ["vendor_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_vendors_vendor_type"), table_name="vendors")
    op.drop_index(op.f("ix_vendors_subprocess"), table_name="vendors")
    op.drop_index(op.f("ix_vendors_status"), table_name="vendors")
    op.drop_index(op.f("ix_vendors_registration_id"), table_name="vendors")
    op.drop_index(op.f("ix_vendors_process"), table_name="vendors")
    op.drop_index(op.f("ix_vendors_outsourcing_owner_user_id"), table_name="vendors")
    op.drop_index(op.f("ix_vendors_name"), table_name="vendors")
    op.drop_index(op.f("ix_vendors_department_id"), table_name="vendors")
    op.drop_table("vendors")

