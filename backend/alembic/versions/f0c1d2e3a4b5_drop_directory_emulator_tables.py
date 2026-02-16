"""drop_directory_emulator_tables

Revision ID: f0c1d2e3a4b5
Revises: e9c3a1b7d2f4
Create Date: 2026-02-16 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f0c1d2e3a4b5"
down_revision: Union[str, Sequence[str], None] = "e9c3a1b7d2f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_table("directory_sync_logs")
    op.drop_table("directory_users")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS directory_sync_status")


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        "directory_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("user_principal_name", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("given_name", sa.String(length=100), nullable=True),
        sa.Column("surname", sa.String(length=100), nullable=True),
        sa.Column("department", sa.String(length=255), nullable=True),
        sa.Column("job_title", sa.String(length=255), nullable=True),
        sa.Column("manager_external_id", sa.String(length=100), nullable=True),
        sa.Column("account_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("source_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_directory_users_account_enabled"), "directory_users", ["account_enabled"], unique=False)
    op.create_index(op.f("ix_directory_users_email"), "directory_users", ["email"], unique=False)
    op.create_index(op.f("ix_directory_users_external_id"), "directory_users", ["external_id"], unique=True)
    op.create_index(op.f("ix_directory_users_user_id"), "directory_users", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_directory_users_user_principal_name"),
        "directory_users",
        ["user_principal_name"],
        unique=False,
    )

    op.create_table(
        "directory_sync_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.Enum("success", "partial", "failed", name="directory_sync_status", create_constraint=True),
            nullable=False,
        ),
        sa.Column("created_count", sa.Integer(), nullable=False),
        sa.Column("updated_count", sa.Integer(), nullable=False),
        sa.Column("deactivated_count", sa.Integer(), nullable=False),
        sa.Column("error_count", sa.Integer(), nullable=False),
        sa.Column("errors", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

