"""
Phase 179-01: Foundation & User Verification
Validates prerequisites for E2E test data seeding.
"""
import asyncio
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models import User, Department, GlobalConfig

REQUIRED_USERS = [
    "cro@riskhub.local",
    "risk.manager@riskhub.local", 
    "ops.head@riskhub.local",
    "fin.head@riskhub.local",
    "it.head@riskhub.local",
    "ops.analyst@riskhub.local",
    "fin.analyst@riskhub.local",
    "it.analyst@riskhub.local",
]

REQUIRED_DEPTS = ["Operations", "Finance", "IT", "Compliance", "Risk Management"]


async def verify_prerequisites():
    """Verify all required users and departments exist."""
    async with async_session_maker() as db:
        # Check users
        missing_users = []
        user_map = {}
        for email in REQUIRED_USERS:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            if not user:
                missing_users.append(email)
            else:
                user_map[email] = user.id
        
        if missing_users:
            print(f"❌ MISSING USERS: {missing_users}")
            print("   Run: python -m app.db.seed first!")
            return None
        
        # Check departments
        missing_depts = []
        dept_map = {}
        for name in REQUIRED_DEPTS:
            result = await db.execute(select(Department).where(Department.name == name))
            dept = result.scalar_one_or_none()
            if not dept:
                missing_depts.append(name)
            else:
                dept_map[name] = dept.id
        
        if missing_depts:
            print(f"❌ MISSING DEPARTMENTS: {missing_depts}")
            return None
        
        print("✅ All prerequisites verified!")
        return {"users": user_map, "departments": dept_map}


async def set_version_marker():
    """Create idempotency marker in global_config."""
    async with async_session_maker() as db:
        result = await db.execute(
            select(GlobalConfig).where(GlobalConfig.key == "e2e_data_version")
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"   E2E data already seeded (version: {existing.value})")
            return False
        
        marker = GlobalConfig(
            key="e2e_data_version", 
            value="179-01",
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
    print("🔍 PHASE 179-01: Foundation Verification")
    print("="*60)
    
    mappings = await verify_prerequisites()
    if not mappings:
        return None
    
    print("\n📋 User ID Mappings:")
    for email, uid in mappings["users"].items():
        print(f"   {email}: {uid}")
    
    print("\n📋 Department ID Mappings:")
    for name, did in mappings["departments"].items():
        print(f"   {name}: {did}")
    
    await set_version_marker()
    
    # Export mappings for other scripts
    return mappings


if __name__ == "__main__":
    result = asyncio.run(seed_foundation())
    exit(0 if result else 1)
