"""
Migration script to add granular permissions for existing databases.

This script ensures "full modality" permission enforcement:
1. kri:submit - Required for KRI value submission (independent from risks:write)
2. controls:execute - Required for logging control executions (independent from controls:write)

This script is IDEMPOTENT - it can be run multiple times safely and will
converge the database to the desired state.

Run:
  PYTHONPATH=backend python backend/scripts/add_granular_permissions.py

If your DB URL isn't in `backend/.env`, set `DATABASE_URL` or pass `--database-url`.
"""

import argparse
import asyncio
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models import Permission, Role, RolePermission

# Define the target state: which roles should have each permission
TARGET_PERMISSIONS = {
    "kri:submit": {
        "roles_to_grant": ["cro", "risk_manager", "department_head"],
        "roles_to_revoke": ["control_owner"],  # Explicitly remove from control_owner
    },
    "controls:execute": {
        "roles_to_grant": ["cro", "risk_manager", "internal_audit", "compliance"],
        "roles_to_revoke": [],
    },
}


async def ensure_permission_exists(db, resource: str, action: str, description: str) -> Permission:
    """Create permission if it doesn't exist, return the permission."""
    result = await db.execute(select(Permission).where(Permission.resource == resource, Permission.action == action))
    perm = result.scalar_one_or_none()

    if not perm:
        perm = Permission(resource=resource, action=action, description=description)
        db.add(perm)
        await db.flush()
        print(f"  ✓ Created permission: {resource}:{action}")
    else:
        print(f"  - Permission exists: {resource}:{action}")

    return perm


async def grant_permission_to_role(db, role: Role, perm: Permission) -> bool:
    """Grant permission to role if not already granted. Returns True if granted."""
    result = await db.execute(
        select(RolePermission).where(RolePermission.role_id == role.id, RolePermission.permission_id == perm.id)
    )
    if result.scalar_one_or_none():
        return False  # Already granted

    db.add(RolePermission(role_id=role.id, permission_id=perm.id))
    return True


async def revoke_permission_from_role(db, role: Role, perm: Permission) -> bool:
    """Revoke permission from role if currently granted. Returns True if revoked."""
    result = await db.execute(
        select(RolePermission).where(RolePermission.role_id == role.id, RolePermission.permission_id == perm.id)
    )
    role_perm = result.scalar_one_or_none()
    if role_perm:
        await db.delete(role_perm)
        return True
    return False


def _mask_database_url(database_url: str) -> str:
    """Return URL with password redacted for logging."""
    try:
        parts = urlsplit(database_url)
        if not parts.username or not parts.password:
            return database_url
        netloc = parts.netloc.replace(f":{parts.password}@", ":***@")
        return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
    except Exception:
        return "<unprintable database_url>"


async def migrate_granular_permissions(database_url: str):
    """Converge database to target permission state. Idempotent."""
    engine = create_async_engine(database_url, future=True)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as db:
        try:
            print("🔄 Converging granular permissions to target state...")
            print(f"    Database: {_mask_database_url(database_url)}")
            print()

            # Step 1: Handle legacy kri:record → kri:submit rename
            result = await db.execute(
                select(Permission).where(Permission.resource == "kri", Permission.action == "record")
            )
            old_kri_record = result.scalar_one_or_none()
            if old_kri_record:
                old_kri_record.action = "submit"
                old_kri_record.description = "Submit KRI values"
                print("  ✓ Renamed kri:record → kri:submit")
                await db.flush()

            # Step 2: Ensure all target permissions exist
            print("\n📋 Ensuring permissions exist...")
            kri_submit = await ensure_permission_exists(db, "kri", "submit", "Submit KRI values")
            controls_execute = await ensure_permission_exists(
                db, "controls", "execute", "Log control execution results"
            )

            # Step 3: Apply role assignments for each permission
            print("\n👥 Applying role assignments...")

            for perm_key, config in TARGET_PERMISSIONS.items():
                resource, action = perm_key.split(":")
                perm = kri_submit if perm_key == "kri:submit" else controls_execute

                # Grant to specified roles
                for role_name in config["roles_to_grant"]:
                    result = await db.execute(select(Role).where(Role.name == role_name))
                    role = result.scalar_one_or_none()

                    if role:
                        if await grant_permission_to_role(db, role, perm):
                            print(f"  ✓ Granted {perm_key} to {role_name}")
                        else:
                            print(f"  - {role_name} already has {perm_key}")
                    else:
                        print(f"  ⚠ Role '{role_name}' not found (skipped)")

                # Revoke from specified roles
                for role_name in config["roles_to_revoke"]:
                    result = await db.execute(select(Role).where(Role.name == role_name))
                    role = result.scalar_one_or_none()

                    if role:
                        if await revoke_permission_from_role(db, role, perm):
                            print(f"  ✓ Revoked {perm_key} from {role_name}")
                        else:
                            print(f"  - {role_name} doesn't have {perm_key}")
                    else:
                        print(f"  - Role '{role_name}' not found (nothing to revoke)")

            await db.commit()
            print("\n✅ Migration complete! Database is now in target state.")
            print("\nSummary:")
            print("  - kri:submit: Independent permission for KRI value submission")
            print("  - controls:execute: Independent permission for execution logging")
            print("  - Reporting owners can still submit KRIs cross-department")

        except Exception as e:
            await db.rollback()
            print(f"\n❌ Migration failed: {e}")
            print("\nTroubleshooting:")
            print("  - Set DATABASE_URL env var (or backend/.env database_url) to a valid async SQLAlchemy URL.")
            print("  - Example: postgresql+asyncpg://user:pass@localhost:5432/riskhub")
            print("  - Or pass: --database-url postgresql+asyncpg://user:pass@host:5432/db")
            raise
        finally:
            await engine.dispose()


if __name__ == "__main__":
    print("🔧 Granular Permissions Migration (Full Modality)")
    print("=" * 50)
    print()
    parser = argparse.ArgumentParser(description="Converge granular permissions (idempotent).")
    parser.add_argument(
        "--database-url",
        dest="database_url",
        default=None,
        help="Override DB URL (otherwise uses backend/.env or DATABASE_URL).",
    )
    args = parser.parse_args()
    database_url = args.database_url or get_settings().database_url
    asyncio.run(migrate_granular_permissions(database_url))
