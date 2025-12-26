"""
Master seed script to populate all data in the correct order.
Run this to seed the entire database from scratch.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from seed_departments import seed_departments
from seed_roles_permissions import seed_roles_permissions
from seed_users import seed_users
from seed_risks import seed_risks
from seed_controls import seed_controls
from seed_kris import seed_kris


if __name__ == "__main__":
    print("=" * 60)
    print("🌱 SEEDING DATABASE")
    print("=" * 60)
    
    print("\n1️⃣  Seeding departments...")
    seed_departments()
    
    print("\n2️⃣  Seeding roles and permissions...")
    seed_roles_permissions()
    
    print("\n3️⃣  Seeding users...")
    seed_users()
    
    print("\n4️⃣  Seeding risks...")
    seed_risks()
    
    print("\n5️⃣  Seeding controls...")
    seed_controls()
    
    print("\n6️⃣  Seeding KRIs...")
    seed_kris()
    
    print("\n" + "=" * 60)
    print("✅ ALL DATA SEEDED SUCCESSFULLY!")
    print("=" * 60)
    print("\n🔑 Demo Accounts (password: test123):")
    print("   CRO (full access):     cro@riskhub.test")
    print("   COO (dept-scoped):     coo@riskhub.test")
    print("   Employee (limited):    ops.employee@riskhub.test")
    print("\n💡 Start the server and login to test!")
