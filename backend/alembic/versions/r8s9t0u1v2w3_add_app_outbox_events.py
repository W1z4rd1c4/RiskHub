"""add transactional outbox events

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-03-07 14:20:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "r8s9t0u1v2w3"
down_revision: Union[str, Sequence[str], None] = "q7r8s9t0u1v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "app_outbox_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("aggregate_type", sa.String(length=50), nullable=False),
        sa.Column("aggregate_id", sa.Integer(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_outbox_events")),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_app_outbox_events_idempotency_key")),
    )
    op.create_index(op.f("ix_app_outbox_events_event_type"), "app_outbox_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_app_outbox_events_status"), "app_outbox_events", ["status"], unique=False)
    op.create_index(
        "ix_app_outbox_events_status_available",
        "app_outbox_events",
        ["status", "available_at"],
        unique=False,
    )
    op.create_index(
        "ix_app_outbox_events_status_locked",
        "app_outbox_events",
        ["status", "locked_at"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_app_outbox_events_status_locked", table_name="app_outbox_events")
    op.drop_index("ix_app_outbox_events_status_available", table_name="app_outbox_events")
    op.drop_index(op.f("ix_app_outbox_events_status"), table_name="app_outbox_events")
    op.drop_index(op.f("ix_app_outbox_events_event_type"), table_name="app_outbox_events")
    op.drop_table("app_outbox_events")
