"""
Legacy RBAC seeding entrypoint.

This script now aligns with the canonical RBAC contract in
`app.db.rbac_seed_contract` to avoid role/permission drift.
"""

import asyncio

from sqlalchemy import delete, select

from app.db.rbac_seed_contract import (
    RBAC_PERMISSIONS,
    RBAC_ROLES,
    RBAC_ROLE_PERMISSIONS,
    expand_permission_keys,
)
from app.core.config import get_settings
from app.db.session import session_context
from app.models import Permission, Role, RolePermission


async def seed_roles_permissions() -> None:
    """Seed roles and permissions using the canonical RBAC contract."""
    async with session_context(get_settings()) as db:
        try:
            print("⚠️  legacy script invoked: applying canonical RBAC contract")

            permissions_by_key: dict[str, Permission] = {}
            for permission_data in RBAC_PERMISSIONS:
                key = f"{permission_data['resource']}:{permission_data['action']}"
                result = await db.execute(
                    select(Permission).where(
                        Permission.resource == permission_data["resource"],
                        Permission.action == permission_data["action"],
                    )
                )
                permission = result.scalar_one_or_none()
                if permission is None:
                    permission = Permission(**permission_data)
                    db.add(permission)
                    await db.flush()
                permissions_by_key[key] = permission

            roles_by_name: dict[str, Role] = {}
            for role_data in RBAC_ROLES:
                role_name = str(role_data["name"])
                result = await db.execute(select(Role).where(Role.name == role_name))
                role = result.scalar_one_or_none()
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
                desired_permission_ids = {
                    permissions_by_key[key].id for key in desired_keys if key in permissions_by_key
                }

                existing_rows = await db.execute(
                    select(RolePermission).where(RolePermission.role_id == role.id)
                )
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

            await db.commit()
            print("✅ Roles and permissions converged to canonical RBAC contract")
        except Exception as exc:  # pragma: no cover - defensive script guard
            await db.rollback()
            print(f"❌ Error seeding canonical RBAC roles/permissions: {exc}")
            raise


if __name__ == "__main__":
    print("🌱 Seeding roles and permissions (canonical contract mode)...")
    asyncio.run(seed_roles_permissions())
