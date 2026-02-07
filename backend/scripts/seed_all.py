"""
Master seed script to populate all data in the correct order.
Run this to seed the entire database from scratch.
"""
import sys
import os
import asyncio

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from seed_departments import seed_departments
from seed_roles_permissions import seed_roles_permissions
from seed_users import seed_users
from seed_risks import seed_risks
from seed_controls import seed_controls
from seed_kris import seed_kris


async def seed_all():
    print("=" * 60)
    print("🌱 SEEDING DATABASE")
    print("=" * 60)
    
    print("\n1️⃣  Seeding departments...")
    await seed_departments()
    
    print("\n2️⃣  Seeding roles and permissions...")
    await seed_roles_permissions()
    
    print("\n3️⃣  Seeding users...")
    await seed_users()
    
    print("\n4️⃣  Seeding risks...")
    await seed_risks()
    
    print("\n5️⃣  Seeding controls...")
    await seed_controls()
    
    print("\n6️⃣  Seeding KRIs...")
    await seed_kris()
    
    # Optional: E2E test data seeding
    if os.environ.get('SEED_E2E_DATA', '').lower() == 'true':
        print("\n7️⃣  Seeding E2E test data...")
        print("   (E2E scripts only reuse existing users/departments from base seed)")
        from seed_e2e_all import seed_e2e_all
        e2e_status = await seed_e2e_all()
        if e2e_status != 0:
            raise RuntimeError("E2E seeding failed. Resolve prerequisites/errors and rerun.")
    
    print("\n" + "=" * 60)
    print("✅ ALL DATA SEEDED SUCCESSFULLY!")
    print("=" * 60)
    print("\n🔑 Demo Accounts (password: test123):")
    print("   CRO (full access):     cro@riskhub.test")
    print("   COO (dept-scoped):     coo@riskhub.test")
    print("   Employee (limited):    ops.employee@riskhub.test")
    print("\n💡 Start the server and login to test!")


if __name__ == "__main__":
    asyncio.run(seed_all())
