"""Canonical production reference seeds within the caller-owned transaction; no Users or demo data."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.rbac_seed_contract import (
    RBAC_PERMISSIONS,
    RBAC_ROLE_PERMISSIONS,
    RBAC_ROLES,
    expand_permission_keys,
)
from app.models import Department, Permission, Role, RolePermission


async def seed_roles_permissions_in_session(db: AsyncSession) -> None:
    permissions_by_key: dict[str, Permission] = {}
    for permission_data in RBAC_PERMISSIONS:
        key = f"{permission_data['resource']}:{permission_data['action']}"
        permission_result = await db.execute(
            select(Permission).where(
                Permission.resource == permission_data["resource"],
                Permission.action == permission_data["action"],
            )
        )
        permission = permission_result.scalar_one_or_none()
        if permission is None:
            permission = Permission(**permission_data)
            db.add(permission)
            await db.flush()
        permissions_by_key[key] = permission

    roles_by_name: dict[str, Role] = {}
    for role_data in RBAC_ROLES:
        role_name = str(role_data["name"])
        role_result = await db.execute(select(Role).where(Role.name == role_name))
        role = role_result.scalar_one_or_none()
        if role is None:
            role = Role(
                name=role_name,
                display_name=str(role_data["display_name"]),
                description=str(role_data["description"]),
                is_system=bool(role_data.get("is_system", False)),
            )
            db.add(role)
            await db.flush()
        else:
            role.display_name = str(role_data["display_name"])
            role.description = str(role_data["description"])
            role.is_system = bool(role_data.get("is_system", False))

        roles_by_name[role_name] = role

    # Converge role-permission links to canonical mapping.
    for role_name, role in roles_by_name.items():
        desired_keys = expand_permission_keys(RBAC_ROLE_PERMISSIONS.get(role_name, ()))
        desired_permission_ids = {permissions_by_key[key].id for key in desired_keys if key in permissions_by_key}

        existing_rows = await db.execute(select(RolePermission).where(RolePermission.role_id == role.id))
        existing_links = list(existing_rows.scalars().all())
        existing_permission_ids = {link.permission_id for link in existing_links}

        # Remove stale links that are no longer part of the canonical contract.
        stale_permission_ids = existing_permission_ids - desired_permission_ids
        if stale_permission_ids:
            await db.execute(
                delete(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id.in_(stale_permission_ids),
                )
            )

        # Add missing links required by the canonical contract.
        for permission_id in sorted(desired_permission_ids - existing_permission_ids):
            db.add(RolePermission(role_id=role.id, permission_id=permission_id))


async def seed_departments_in_session(db: AsyncSession) -> None:
    departments_data = [
        ("Operations", "OPS", "Operations and business processes"),
        ("Underwriting", "UW", "Underwriting and risk assessment"),
        ("Claims", "CLM", "Claims processing and management"),
        ("IT", "IT", "Information Technology"),
        ("Finance", "FIN", "Finance and accounting"),
        ("Actuarial", "ACT", "Actuarial analysis and modeling"),
        ("Risk Management", "RISK", "Enterprise risk management"),
        ("Compliance", "COMP", "Regulatory compliance"),
        ("Legal", "LEG", "Legal affairs and counsel"),
        ("Human Resources", "HR", "Human resources and talent management"),
    ]
    for name, code, description in departments_data:
        existing = await db.scalar(select(Department).where(Department.name == name))
        if existing is None:
            db.add(Department(name=name, code=code, description=description))
    await db.flush()
