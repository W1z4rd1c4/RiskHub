"""convert_naive_timestamps_to_timestamptz

Revision ID: e9c3a1b7d2f4
Revises: 13e6f7a8b9c0
Create Date: 2026-02-14 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e9c3a1b7d2f4"
down_revision: Union[str, Sequence[str], None] = "13e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLE_COLUMNS: dict[str, list[str]] = {
    "approval_requests": ["resolved_at", "primary_approved_at", "privileged_approved_at"],
    "approval_scenarios": ["updated_at"],
    "control_executions": ["executed_at", "next_scheduled", "created_at"],
    "control_risk_links": ["created_at"],
    "controls": ["created_at", "updated_at"],
    "departments": ["created_at", "updated_at"],
    "global_config": ["updated_at"],
    "key_risk_indicators": ["archived_at", "created_at", "last_reported_at", "last_updated"],
    "kri_value_history": ["recorded_at"],
    "orphaned_items": ["orphaned_at", "resolved_at"],
    "risk_types": ["created_at", "updated_at"],
    "risks": ["created_at", "updated_at"],
    "vendor_control_links": ["created_at"],
    "vendor_risk_factors": ["created_at", "updated_at"],
    "vendor_risk_links": ["created_at"],
    "vendors": ["created_at", "updated_at"],
}


def _upgrade_postgres() -> None:
    for table, columns in _TABLE_COLUMNS.items():
        for column in columns:
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(),
                type_=sa.DateTime(timezone=True),
                postgresql_using=f"{column} AT TIME ZONE 'UTC'",
            )


def _downgrade_postgres() -> None:
    for table, columns in _TABLE_COLUMNS.items():
        for column in columns:
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(timezone=True),
                type_=sa.DateTime(),
                postgresql_using=f"{column} AT TIME ZONE 'UTC'",
            )


def upgrade() -> None:
    """Upgrade schema: convert remaining naive timestamps to timestamptz (UTC)."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # RiskHub's production DB is PostgreSQL; other dialects are out of scope.
        return
    _upgrade_postgres()


def downgrade() -> None:
    """Downgrade schema: revert timestamptz columns back to naive timestamps."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    _downgrade_postgres()

