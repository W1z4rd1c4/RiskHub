"""sync vendor contract permissions for existing databases

ICT Register Vendor Contracts (issue #44): the ``vendor_contracts:read`` and
``vendor_contracts:write`` permission rows were seeded while the surface was
RESERVED (ADR-009), with ``vendor_contracts:*`` parked on the compliance role.
Now that the surface ships, deployed databases must mirror
``app/db/rbac_seed_contract.py`` exactly: risk_manager holds
``vendor_contracts:*`` and every role holding ``vendors:read`` gains
``vendor_contracts:read``. The CRO wildcard row is re-ensured and CRO
additionally receives explicit rows (the 18c1d2e3f4a6 precedent, followed by
q4r5s6t7u8v9 for processes and s6t7u8v9w0x1 for assets).

One deliberate departure from the add-only precedent: the reserved-era seed
granted compliance ``vendor_contracts:write``; the shipped contract grants
compliance read only, so exactly that stale SEED-era grant is retired here.
Custom (non-seed) grants are never removed — the retirement targets the one
role/permission pair the old seed created.

Revision ID: u8v9w0x1y2z3
Revises: t7u8v9w0x1y2
Create Date: 2026-07-10 15:35:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "u8v9w0x1y2z3"
down_revision: Union[str, Sequence[str], None] = "t7u8v9w0x1y2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Verbatim seed-contract rows (app/db/rbac_seed_contract.py RBAC_PERMISSIONS);
# kept in parity by tests/backend/pytest/test_ict_register_vendor_contracts.py.
VENDOR_CONTRACT_PERMISSIONS: tuple[dict[str, str], ...] = (
    {"resource": "vendor_contracts", "action": "read", "description": "View vendor contracts and DORA clauses"},
    {"resource": "vendor_contracts", "action": "write", "description": "Create/edit vendor contracts and DORA clauses"},
)

# Mirrors RBAC_ROLE_PERMISSIONS: risk_manager expands vendor_contracts:*; the
# read grant follows the vendors:read holders. The platform admin role stays
# excluded from business data; CRO is handled via the wildcard below.
ROLE_VENDOR_CONTRACT_GRANTS: dict[str, tuple[str, ...]] = {
    "risk_manager": ("vendor_contracts:read", "vendor_contracts:write"),
    "actuarial": ("vendor_contracts:read",),
    "compliance": ("vendor_contracts:read",),
    "internal_audit": ("vendor_contracts:read",),
    "department_head": ("vendor_contracts:read",),
    "employee": ("vendor_contracts:read",),
    "viewer": ("vendor_contracts:read",),
}

# Reserved-era seed grants that no longer exist in the shipped contract.
RETIRED_ROLE_GRANTS: dict[str, tuple[str, ...]] = {
    "compliance": ("vendor_contracts:write",),
}


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

    def retire_role_permission(*, role_id: int, permission_id: int) -> None:
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE role_id = :role_id AND permission_id = :permission_id"
            ),
            {"role_id": role_id, "permission_id": permission_id},
        )

    # Ensure the vendor-contract permission rows exist (idempotent; they were
    # already seeded on most databases while the surface was reserved).
    permission_ids_by_key: dict[str, int] = {}
    for permission in VENDOR_CONTRACT_PERMISSIONS:
        key = f"{permission['resource']}:{permission['action']}"
        permission_ids_by_key[key] = ensure_permission(
            resource=permission["resource"],
            action=permission["action"],
            description=permission["description"],
        )

    # Ensure CRO keeps wildcard access on already-seeded databases and grant
    # the explicit vendor-contract rows as well (18c1d2e3f4a6/18c1d2e3f4a7 precedent).
    perm_all = ensure_permission(resource="*", action="*", description="Full access to all resources")
    cro_role_id = get_role_id("cro")
    if cro_role_id is not None:
        ensure_role_permission(role_id=cro_role_id, permission_id=perm_all)
        for permission_id in permission_ids_by_key.values():
            ensure_role_permission(role_id=cro_role_id, permission_id=permission_id)

    # Grant to default roles per the seed contract (idempotent).
    for role_name, permission_keys in ROLE_VENDOR_CONTRACT_GRANTS.items():
        role_id = get_role_id(role_name)
        if role_id is None:
            continue
        for permission_key in permission_keys:
            ensure_role_permission(role_id=role_id, permission_id=permission_ids_by_key[permission_key])

    # Retire the reserved-era seed grants the shipped contract dropped
    # (compliance held vendor_contracts:* while the surface was parked).
    for role_name, permission_keys in RETIRED_ROLE_GRANTS.items():
        role_id = get_role_id(role_name)
        if role_id is None:
            continue
        for permission_key in permission_keys:
            retire_role_permission(role_id=role_id, permission_id=permission_ids_by_key[permission_key])


def downgrade() -> None:
    raise NotImplementedError("This migration is forward-only.")
