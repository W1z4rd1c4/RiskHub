"""sync vendor permissions for existing databases

Revision ID: 18c1d2e3f4a6
Revises: 18c1d2e3f4a5
Create Date: 2026-01-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "18c1d2e3f4a6"
down_revision: Union[str, Sequence[str], None] = "18c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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

    # Ensure vendor permissions exist
    perm_all = ensure_permission(resource="*", action="*", description="Full access to all resources")

    perm_vendors_read = ensure_permission(resource="vendors", action="read", description="View vendors")
    perm_vendors_write = ensure_permission(resource="vendors", action="write", description="Create/edit vendors")
    perm_vendors_delete = ensure_permission(resource="vendors", action="delete", description="Archive vendors")

    perm_vendor_contracts_read = ensure_permission(
        resource="vendor_contracts", action="read", description="View vendor contracts and DORA clauses"
    )
    perm_vendor_contracts_write = ensure_permission(
        resource="vendor_contracts", action="write", description="Create/edit vendor contracts and DORA clauses"
    )

    # Assign to default roles (idempotent; does not remove any existing custom grants)
    cro_role_id = get_role_id("cro")
    if cro_role_id is not None:
        # Ensure CRO can access new modules even on already-seeded DBs.
        ensure_role_permission(role_id=cro_role_id, permission_id=perm_all)

    risk_manager_role_id = get_role_id("risk_manager")
    if risk_manager_role_id is not None:
        for pid in [perm_vendors_read, perm_vendors_write, perm_vendors_delete]:
            ensure_role_permission(role_id=risk_manager_role_id, permission_id=pid)

    department_head_role_id = get_role_id("department_head")
    if department_head_role_id is not None:
        for pid in [perm_vendors_read, perm_vendors_write]:
            ensure_role_permission(role_id=department_head_role_id, permission_id=pid)

    for role_name in ["actuarial", "compliance", "internal_audit", "employee", "viewer"]:
        role_id = get_role_id(role_name)
        if role_id is not None:
            ensure_role_permission(role_id=role_id, permission_id=perm_vendors_read)

    compliance_role_id = get_role_id("compliance")
    if compliance_role_id is not None:
        for pid in [perm_vendor_contracts_read, perm_vendor_contracts_write]:
            ensure_role_permission(role_id=compliance_role_id, permission_id=pid)


def downgrade() -> None:
    # Data migration is intentionally non-destructive.
    pass

