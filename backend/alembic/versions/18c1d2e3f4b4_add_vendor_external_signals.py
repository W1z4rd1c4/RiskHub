"""Add vendor external signals table (Phase 18-10).

Revision ID: 18c1d2e3f4b4
Revises: 18c1d2e3f4b3
Create Date: 2026-01-26
"""

from alembic import op
import sqlalchemy as sa


revision = "18c1d2e3f4b4"
down_revision = "18c1d2e3f4b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vendor_external_signals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("provider_key", sa.String(length=50), nullable=False, index=True),
        sa.Column("signal_type", sa.String(length=50), nullable=False, index=True),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum("ok", "error", name="vendor_external_signal_status", native_enum=False),
            nullable=False,
            server_default="ok",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index(
        "ix_vendor_external_signals_vendor_provider_fetched",
        "vendor_external_signals",
        ["vendor_id", "provider_key", "fetched_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_vendor_external_signals_vendor_provider_fetched", table_name="vendor_external_signals")
    op.drop_table("vendor_external_signals")
    # Only relevant for Postgres; SQLite doesn't support DROP TYPE.
    if op.get_context().dialect.name != "sqlite":
        op.execute("DROP TYPE IF EXISTS vendor_external_signal_status")
