"""
Phase 179-01: Foundation & User Verification
Validates prerequisites for E2E test data seeding.
"""
import asyncio
from sqlalchemy import select
from app.core.config import get_settings
from app.db.session import session_context
from app.models import GlobalConfig
from scripts.e2e_mappings import (
    REQUIRED_USER_EMAILS,
    REQUIRED_DEPARTMENT_NAMES,
    load_mappings,
    get_missing_required_keys,
)

E2E_DATA_VERSION = "179-16"


async def verify_prerequisites():
    """Verify all required users and departments exist."""
    async with session_context(get_settings()) as db:
        user_map, dept_map = await load_mappings(db)
        missing_users, missing_depts = get_missing_required_keys(user_map, dept_map)

        if missing_users or missing_depts:
            if missing_users:
                print(f"❌ MISSING USERS: {missing_users}")
            if missing_depts:
                print(f"❌ MISSING DEPARTMENTS: {missing_depts}")
            print("   Run: python -m app.db.seed first!")
            print("   E2E seed scripts never create users or departments.")
            return None

        print("✅ All prerequisites verified!")
        return {"users": user_map, "departments": dept_map}


async def set_version_marker():
    """Create idempotency marker in global_config."""
    async with session_context(get_settings()) as db:
        result = await db.execute(
            select(GlobalConfig).where(GlobalConfig.key == "e2e_data_version")
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            if existing.value != E2E_DATA_VERSION:
                existing.value = E2E_DATA_VERSION
                await db.commit()
                print(f"   ✓ Version marker updated to {E2E_DATA_VERSION}")
            else:
                print(f"   E2E data already seeded (version: {existing.value})")
            return False
        
        marker = GlobalConfig(
            key="e2e_data_version", 
            value=E2E_DATA_VERSION,
            category="system",
            display_name="E2E Data Version",
            description="Version marker for E2E test data seeding",
        )
        db.add(marker)
        await db.commit()
        print("   ✓ Version marker set")
        return True


async def seed_foundation():
    """Main entry point."""
    print("="*60)
    print("🔍 PHASE 179-12: Fresh DB Foundation Hardening")
    print("="*60)
    print("⚠️  Contract: E2E seeding validates and reuses existing users/departments only.")
    print("   It never creates users or departments.")
    
    mappings = await verify_prerequisites()
    if not mappings:
        return None
    
    print("\n📋 User ID Mappings:")
    for email in REQUIRED_USER_EMAILS:
        uid = mappings["users"][email]
        print(f"   {email}: {uid}")
    
    print("\n📋 Department ID Mappings:")
    for name in REQUIRED_DEPARTMENT_NAMES:
        did = mappings["departments"][name]
        print(f"   {name}: {did}")
    
    await set_version_marker()
    
    # Export mappings for other scripts
    return mappings


if __name__ == "__main__":
    result = asyncio.run(seed_foundation())
    exit(0 if result else 1)
