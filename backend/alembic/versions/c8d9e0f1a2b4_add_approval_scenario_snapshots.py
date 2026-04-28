"""Add approval scenario snapshots and missing KRI scenario rows."""

from __future__ import annotations

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c8d9e0f1a2b4"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TIER_CAPABLE_SCENARIO_KEYS = (
    "risk_delete",
    "control_delete",
    "kri_delete",
    "control_edit",
    "kri_value_submit",
    "kri_history_correction",
)
PRIVILEGED_SCENARIO_ROLES = ("risk_manager", "cro")


def _privileged_safe_approver_roles(raw_roles: str) -> str:
    roles = json.loads(raw_roles)
    if not isinstance(roles, list):
        roles = []
    normalized_roles = [str(role) for role in roles]
    if any(role in PRIVILEGED_SCENARIO_ROLES for role in normalized_roles):
        return json.dumps(normalized_roles)
    return json.dumps([*normalized_roles, *PRIVILEGED_SCENARIO_ROLES])


def _ensure_tier_capable_scenarios_have_privileged_finishers() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT key, approver_roles
            FROM approval_scenarios
            WHERE key IN :scenario_keys
            """
        ).bindparams(sa.bindparam("scenario_keys", expanding=True)),
        {"scenario_keys": TIER_CAPABLE_SCENARIO_KEYS},
    )
    for key, approver_roles in rows:
        privileged_safe_roles = _privileged_safe_approver_roles(approver_roles)
        if privileged_safe_roles == approver_roles:
            continue
        conn.execute(
            sa.text("UPDATE approval_scenarios SET approver_roles = :approver_roles WHERE key = :key"),
            {"key": key, "approver_roles": privileged_safe_roles},
        )


def upgrade() -> None:
    op.add_column("approval_requests", sa.Column("scenario_key", sa.String(length=50), nullable=True))
    op.add_column("approval_requests", sa.Column("scenario_approver_roles", sa.JSON(), nullable=True))
    op.create_index("ix_approval_requests_scenario_key", "approval_requests", ["scenario_key"])

    op.execute(
        """
        INSERT INTO approval_scenarios (key, display_name, description, requires_approval, approver_roles)
        SELECT 'kri_edit', 'KRI Edit', 'Changes to KRI configuration', true, '["risk_owner", "risk_manager", "cro"]'
        WHERE NOT EXISTS (SELECT 1 FROM approval_scenarios WHERE key = 'kri_edit')
        """
    )
    op.execute(
        """
        INSERT INTO approval_scenarios (key, display_name, description, requires_approval, approver_roles)
        SELECT 'kri_history_correction', 'KRI History Correction',
               'Corrections to recorded KRI history values', true, '["cro"]'
        WHERE NOT EXISTS (SELECT 1 FROM approval_scenarios WHERE key = 'kri_history_correction')
        """
    )
    _ensure_tier_capable_scenarios_have_privileged_finishers()


def downgrade() -> None:
    op.execute("DELETE FROM approval_scenarios WHERE key IN ('kri_edit', 'kri_history_correction')")
    op.drop_index("ix_approval_requests_scenario_key", table_name="approval_requests")
    op.drop_column("approval_requests", "scenario_approver_roles")
    op.drop_column("approval_requests", "scenario_key")
