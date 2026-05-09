"""Add risk_owner to the default risk_edit_priority approval scenario."""

from __future__ import annotations

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e0f1a2b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d9e0f1a2b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCENARIO_KEY = "risk_edit_priority"
DEFAULT_ROLES = ["risk_manager", "cro"]
UPDATED_ROLES = ["risk_owner", "risk_manager", "cro"]


def _role_json(roles: list[str], *, compact: bool = False) -> str:
    if compact:
        return json.dumps(roles, separators=(",", ":"))
    return json.dumps(roles)


def upgrade_risk_edit_priority_roles(conn) -> None:
    """Update only the original default role list, preserving customized rows."""
    conn.execute(
        sa.text(
            """
            UPDATE approval_scenarios
            SET approver_roles = :updated_roles
            WHERE key = :scenario_key
              AND approver_roles IN (:default_roles, :default_roles_compact)
            """
        ),
        {
            "scenario_key": SCENARIO_KEY,
            "updated_roles": _role_json(UPDATED_ROLES),
            "default_roles": _role_json(DEFAULT_ROLES),
            "default_roles_compact": _role_json(DEFAULT_ROLES, compact=True),
        },
    )


def downgrade_risk_edit_priority_roles(conn) -> None:
    """Restore the previous default only when the row still has the upgraded default."""
    conn.execute(
        sa.text(
            """
            UPDATE approval_scenarios
            SET approver_roles = :default_roles
            WHERE key = :scenario_key
              AND approver_roles IN (:updated_roles, :updated_roles_compact)
            """
        ),
        {
            "scenario_key": SCENARIO_KEY,
            "default_roles": _role_json(DEFAULT_ROLES),
            "updated_roles": _role_json(UPDATED_ROLES),
            "updated_roles_compact": _role_json(UPDATED_ROLES, compact=True),
        },
    )


def upgrade() -> None:
    upgrade_risk_edit_priority_roles(op.get_bind())


def downgrade() -> None:
    downgrade_risk_edit_priority_roles(op.get_bind())
