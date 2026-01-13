"""
Phase 179-06: Master E2E Data Seeding
Orchestrates all E2E test data seeding scripts.

Usage:
    python -m scripts.seed_e2e_all

Or via seed_all.py with environment variable:
    SEED_E2E_DATA=true python -m scripts.seed_all
"""
import asyncio
from scripts.seed_e2e_foundation import seed_foundation
from scripts.seed_e2e_risks import seed_risks
from scripts.seed_e2e_controls import seed_controls
from scripts.seed_e2e_kris import seed_kris
from scripts.seed_e2e_approvals import seed_approvals
from scripts.seed_e2e_activity_logs import seed_activity_logs
from scripts.seed_e2e_resolved_approvals import seed_resolved_approvals
from scripts.seed_e2e_sensitive_approvals import seed_sensitive_approvals


async def seed_e2e_all():
    """Orchestrate all E2E test data seeding."""
    print("\n" + "="*60)
    print("🌱 PHASE 179: E2E TEST DATA SEEDING")
    print("="*60)
    
    # Step 1: Verify prerequisites
    print("\n1️⃣  Foundation & Verification...")
    mappings = await seed_foundation()
    if not mappings:
        print("❌ Prerequisites check failed!")
        return 1
    
    # Step 2: Seed risks
    print("\n2️⃣  Seeding Risks...")
    await seed_risks()
    
    # Step 3: Seed controls
    print("\n3️⃣  Seeding Controls...")
    await seed_controls()
    
    # Step 4: Seed KRIs
    print("\n4️⃣  Seeding KRIs...")
    await seed_kris()
    
    # Step 5: Seed approvals
    print("\n5️⃣  Seeding Approvals...")
    await seed_approvals()
    
    # Step 6: Seed activity logs (Phase 179-07)
    print("\n6️⃣  Seeding Activity Logs...")
    await seed_activity_logs()
    
    # Step 7: Seed resolved approvals (Phase 179-08)
    print("\n7️⃣  Seeding Resolved Approvals...")
    await seed_resolved_approvals()
    
    # Step 8: Seed sensitive field approvals (Phase 179-09)
    print("\n8️⃣  Seeding Sensitive Field Approvals...")
    await seed_sensitive_approvals()
    
    # Summary
    print("\n" + "="*60)
    print("✅ E2E TEST DATA SEEDING COMPLETE")
    print("="*60)
    print("\n📊 Summary:")
    print("   • 15 E2E risks (10 cross-department)")
    print("   • 12 E2E controls (14 risk links)")
    print("   • 10 E2E KRIs (4 cross-department reporters)")
    print("   • 5 E2E pending approval requests")
    print("   • 4 E2E resolved approval requests")
    print("   • 7 E2E sensitive field approval requests")
    print("   • 13 E2E activity log entries")
    print("\n💡 All entities prefixed with 'E2E-' for isolation")
    return 0


if __name__ == "__main__":
    exit(asyncio.run(seed_e2e_all()))
