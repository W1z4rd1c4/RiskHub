"""sync ICT committee permissions for existing databases

ICT Risk Committee page (issue #51): existing databases were seeded before
the ``ict_committee`` resource — and before the three executive roles —
existed, and the startup seed only populates empty databases. Following the
repo convention shipped with every new resource (13d4e5f6a7b8 for issues,
18c1d2e3f4a6/18c1d2e3f4a7 for vendors, q4r5s6t7u8v9 for processes,
s6t7u8v9w0x1 for assets, z1a2b3c4d5e6 for threats), this data migration
idempotently ensures the ``ict_committee:read`` permission row exists,
ensures the ceo/cfo/coo roles exist verbatim from
``app/db/rbac_seed_contract.py`` (a first for a sync migration — the roles
themselves are new), and grants the permission to the executive/oversight
holder set exactly as the seed contract declares: ceo, cfo, coo,
risk_manager, compliance, internal_audit. The CRO wildcard row is re-ensured
and CRO additionally receives the explicit committee row (the 18c1d2e3f4a7
precedent). Platform admin, employee, department_head, and viewer are NOT
granted. Existing custom grants are never removed.

Revision ID: b3c4d5e6f7a8
Revises: z1a2b3c4d5e6
Create Date: 2026-07-10 10:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "z1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Verbatim seed-contract row (app/db/rbac_seed_contract.py RBAC_PERMISSIONS);
# kept in parity by tests/backend/pytest/test_ict_register_committee.py.
COMMITTEE_PERMISSION: dict[str, str] = {
    "resource": "ict_committee",
    "action": "read",
    "description": "View the ICT Risk Committee page",
}

# Verbatim seed-contract rows (RBAC_ROLES): the executive roles are NEW with
# this resource, so the sync migration must create them on deployed DBs.
EXECUTIVE_ROLES: tuple[dict[str, object], ...] = (
    {
        "name": "ceo",
        "display_name": "Chief Executive Officer",
        "description": "Executive oversight, ICT Risk Committee",
    },
    {
        "name": "cfo",
        "display_name": "Chief Financial Officer",
        "description": "Executive oversight, ICT Risk Committee",
    },
    {
        "name": "coo",
        "display_name": "Chief Operating Officer",
        "description": "Executive oversight, ICT Risk Committee",
    },
)

# Mirrors RBAC_ROLE_PERMISSIONS: every seed role holding ict_committee:read.
# The platform admin role stays excluded from business data; CRO is handled
# via the wildcard below.
COMMITTEE_GRANT_ROLES: tuple[str, ...] = (
    "ceo",
    "cfo",
    "coo",
    "risk_manager",
    "compliance",
    "internal_audit",
)


def upgrade() -> None:
    conn = op.get_bind()

    def ensure_permission(*, resource: str, action: str, description: str) -> int:
        existing = conn.execute(
            sa.text(
                "SELECT id FROM permissions WHERE resource = :resource AND action = :action ORDER BY id ASC LIMIT 1"
            ),
            {"resource": resource, "action": action},
        ).scalar()
        if existing is not None:
            return int(existing)

        conn.execute(
            sa.text(
                "INSERT INTO permissions (resource, action, description) "
                "SELECT :resource, :action, :description "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE resource = :resource AND action = :action)"
            ),
            {"resource": resource, "action": action, "description": description},
        )
        created = conn.execute(
            sa.text(
                "SELECT id FROM permissions WHERE resource = :resource AND action = :action ORDER BY id ASC LIMIT 1"
            ),
            {"resource": resource, "action": action},
        ).scalar()
        if created is None:
            raise RuntimeError(f"Failed to ensure permission {resource}:{action}")
        return int(created)

    def get_role_id(role_name: str) -> int | None:
        role_id = conn.execute(
            sa.text("SELECT id FROM roles WHERE name = :name ORDER BY id ASC LIMIT 1"),
            {"name": role_name},
        ).scalar()
        return int(role_id) if role_id is not None else None

    def ensure_role(*, name: str, display_name: str, description: str) -> int:
        existing = get_role_id(name)
        if existing is not None:
            return existing
        conn.execute(
            sa.text(
                "INSERT INTO roles (name, display_name, description, is_system, is_active) "
                "SELECT :name, :display_name, :description, :is_system, :is_active "
                "WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = :name)"
            ),
            {
                "name": name,
                "display_name": display_name,
                "description": description,
                "is_system": False,
                "is_active": True,
            },
        )
        created = get_role_id(name)
        if created is None:
            raise RuntimeError(f"Failed to ensure role {name}")
        return created

    def ensure_role_permission(*, role_id: int, permission_id: int) -> None:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT :role_id, :permission_id "
                "WHERE NOT EXISTS ("
                "  SELECT 1 FROM role_permissions WHERE role_id = :role_id AND permission_id = :permission_id"
                ")"
            ),
            {"role_id": role_id, "permission_id": permission_id},
        )

    # Ensure the committee permission row exists (idempotent).
    committee_permission_id = ensure_permission(
        resource=COMMITTEE_PERMISSION["resource"],
        action=COMMITTEE_PERMISSION["action"],
        description=COMMITTEE_PERMISSION["description"],
    )

    # Ensure the NEW executive roles exist verbatim (idempotent; deployed DBs
    # never saw them — the startup seed only runs on empty databases).
    for role in EXECUTIVE_ROLES:
        ensure_role(
            name=str(role["name"]),
            display_name=str(role["display_name"]),
            description=str(role["description"]),
        )

    # Ensure CRO keeps wildcard access on already-seeded databases and grant
    # the explicit committee row as well (18c1d2e3f4a7 precedent).
    perm_all = ensure_permission(resource="*", action="*", description="Full access to all resources")
    cro_role_id = get_role_id("cro")
    if cro_role_id is not None:
        ensure_role_permission(role_id=cro_role_id, permission_id=perm_all)
        ensure_role_permission(role_id=cro_role_id, permission_id=committee_permission_id)

    # Grant to the executive/oversight holder set per the seed contract
    # (idempotent; never removes existing custom grants).
    for role_name in COMMITTEE_GRANT_ROLES:
        role_id = get_role_id(role_name)
        if role_id is None:
            continue
        ensure_role_permission(role_id=role_id, permission_id=committee_permission_id)


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
