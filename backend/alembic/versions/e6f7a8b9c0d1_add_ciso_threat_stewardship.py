"""add CISO role and Threat stewardship

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-15 12:55:00.000000

Existing threats remain unassigned and are exposed as stewardship gaps. New
active threats are required by the application boundary to name an active
CISO; no historical ownership evidence is fabricated during migration.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CISO_PERMISSION_KEYS = (
    "threats:read",
    "threats:write",
    "threats:delete",
    "risks:read",
    "controls:read",
    "issues:read",
    "processes:read",
    "assets:read",
    "vendors:read",
    "vendor_contracts:read",
    "departments:read",
    "reports:read",
    "ict_committee:read",
    "activity_log:read",
)

PERMISSION_DESCRIPTIONS = {
    "threats:read": "View ICT Register threats",
    "threats:write": "Create/edit ICT Register threats",
    "threats:delete": "Archive/restore ICT Register threats",
    "risks:read": "View risks",
    "controls:read": "View controls",
    "issues:read": "View issues/findings",
    "processes:read": "View ICT Register processes",
    "assets:read": "View ICT Register assets",
    "vendors:read": "View vendors",
    "vendor_contracts:read": "View vendor contracts and DORA clauses",
    "departments:read": "View departments",
    "reports:read": "View and export reports",
    "ict_committee:read": "View the ICT Risk Committee page",
    "activity_log:read": "View activity log",
}


def upgrade() -> None:
    op.add_column(
        "threats",
        sa.Column("threat_steward_user_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_threats_threat_steward_user_id",
        "threats",
        ["threat_steward_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_threats_threat_steward_user_id_users",
        "threats",
        "users",
        ["threat_steward_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    conn = op.get_bind()
    for source_value, canonical_code in (
        ("Dostupnost", "availability"),
        ("Integrita", "integrity"),
        ("Důvěrnost", "confidentiality"),
        ("Hodnověrnost", "authenticity"),
        ("Fyzická", "physical"),
        ("Personální", "personnel"),
        ("Třetí strany", "third_party"),
    ):
        conn.execute(
            sa.text("UPDATE threats SET category = :code WHERE category = :source"),
            {"code": canonical_code, "source": source_value},
        )

    conn.execute(
        sa.text(
            "INSERT INTO roles (name, display_name, description, is_system, is_active) "
            "SELECT 'ciso', 'Chief Information Security Officer', "
            "'Threat stewardship and ICT security oversight', false, true "
            "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ciso')"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE roles SET "
            "display_name = 'Chief Information Security Officer', "
            "description = 'Threat stewardship and ICT security oversight', "
            "is_system = false, is_active = true "
            "WHERE name = 'ciso'"
        )
    )
    role_id = conn.execute(sa.text("SELECT id FROM roles WHERE name = 'ciso'")).scalar_one()
    permission_ids: list[int] = []
    for key in CISO_PERMISSION_KEYS:
        resource, action = key.split(":", maxsplit=1)
        conn.execute(
            sa.text(
                "INSERT INTO permissions (resource, action, description) "
                "SELECT :resource, :action, :description "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions "
                "WHERE resource = :resource AND action = :action)"
            ),
            {
                "resource": resource,
                "action": action,
                "description": PERMISSION_DESCRIPTIONS[key],
            },
        )
        permission_id = conn.execute(
            sa.text(
                "SELECT id FROM permissions "
                "WHERE resource = :resource AND action = :action ORDER BY id LIMIT 1"
            ),
            {"resource": resource, "action": action},
        ).scalar_one()
        permission_ids.append(permission_id)

    # A deployment may already have a user-created role named ``ciso``. Treat
    # this migration as the canonicalization boundary: discard its prior grant
    # links (including duplicate links) and install exactly the least-privilege
    # stewardship contract. Permission rows themselves remain shared and are
    # not deleted.
    conn.execute(
        sa.text("DELETE FROM role_permissions WHERE role_id = :role_id"),
        {"role_id": role_id},
    )
    for permission_id in permission_ids:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "VALUES (:role_id, :permission_id)"
            ),
            {"role_id": role_id, "permission_id": permission_id},
        )


def downgrade() -> None:
    """Forward-only migration. Restore from snapshot per ADR-010."""
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
