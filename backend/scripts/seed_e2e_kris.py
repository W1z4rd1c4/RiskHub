"""
Phase 179-04: KRI Data with Reporting Owners
Creates 10 KRIs linked to E2E risks for testing.
"""
import asyncio
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models import KeyRiskIndicator, Risk
from scripts.e2e_mappings import load_mappings


KRIS = [
    {
        "name": "E2E-KRI-001 Motor Loss Ratio",
        "description": "Ratio of claims paid to premiums earned for motor insurance",
        "risk_code": "E2E-UW-001",
        "reporting_owner": "fin.analyst@riskhub.local",  # Cross-department!
        "unit": "%",
        "lower_limit": 0.0,
        "upper_limit": 65.0,
        "current_value": 58.0,
        "frequency": "monthly",
    },
    {
        "name": "E2E-KRI-002 Travel Claim Frequency",
        "description": "Daily count of travel insurance claims submitted",
        "risk_code": "E2E-UW-002",
        "reporting_owner": "ops.analyst@riskhub.local",
        "unit": "count/day",
        "lower_limit": 0.0,
        "upper_limit": 5.0,
        "current_value": 3.0,
        "frequency": "daily",
    },
    {
        "name": "E2E-KRI-003 Property Accumulation Percentage",
        "description": "Percentage of property portfolio concentrated in single region",
        "risk_code": "E2E-UW-003",
        "reporting_owner": "ops.head@riskhub.local",
        "unit": "%",
        "lower_limit": 0.0,
        "upper_limit": 10.0,
        "current_value": 7.0,
        "frequency": "quarterly",
    },
    {
        "name": "E2E-KRI-004 Fraud Detection Rate",
        "description": "Percentage of claims flagged as potentially fraudulent",
        "risk_code": "E2E-CLM-001",
        "reporting_owner": "fin.head@riskhub.local",
        "unit": "%",
        "lower_limit": 10.0,
        "upper_limit": 100.0,
        "current_value": 12.0,
        "frequency": "weekly",
    },
    {
        "name": "E2E-KRI-005 Reserve Adequacy Ratio",
        "description": "Ratio of actual reserves to actuarial best estimate",
        "risk_code": "E2E-CLM-002",
        "reporting_owner": "it.analyst@riskhub.local",  # Cross-department!
        "unit": "%",
        "lower_limit": 95.0,
        "upper_limit": 105.0,
        "current_value": 102.0,
        "frequency": "monthly",
    },
    {
        "name": "E2E-KRI-006 Failed Login Attempts",
        "description": "Daily count of failed login attempts across systems",
        "risk_code": "E2E-IT-001",
        "reporting_owner": "it.analyst@riskhub.local",
        "unit": "count/day",
        "lower_limit": 0.0,
        "upper_limit": 10.0,
        "current_value": 5.0,
        "frequency": "daily",
    },
    {
        "name": "E2E-KRI-007 Data Breach Incidents",
        "description": "Yearly count of confirmed data breach incidents",
        "risk_code": "E2E-IT-002",
        "reporting_owner": "fin.analyst@riskhub.local",  # Cross-department!
        "unit": "count/year",
        "lower_limit": 0.0,
        "upper_limit": 0.0,
        "current_value": 0.0,
        "frequency": "monthly",
    },
    {
        "name": "E2E-KRI-008 System Uptime",
        "description": "Monthly system uptime percentage for core insurance systems",
        "risk_code": "E2E-IT-003",
        "reporting_owner": "it.head@riskhub.local",
        "unit": "%",
        "lower_limit": 99.9,
        "upper_limit": 100.0,
        "current_value": 99.95,
        "frequency": "monthly",
    },
    {
        "name": "E2E-KRI-009 Open Compliance Gaps",
        "description": "Count of unresolved regulatory compliance gaps",
        "risk_code": "E2E-COMP-001",
        "reporting_owner": "risk.manager@riskhub.local",
        "unit": "count",
        "lower_limit": 0.0,
        "upper_limit": 0.0,
        "current_value": 1.0,
        "frequency": "monthly",
    },
    {
        "name": "E2E-KRI-010 AML Alert Backlog",
        "description": "Count of unreviewed AML transaction alerts",
        "risk_code": "E2E-COMP-002",
        "reporting_owner": "ops.analyst@riskhub.local",  # Cross-department!
        "unit": "count",
        "lower_limit": 0.0,
        "upper_limit": 10.0,
        "current_value": 5.0,
        "frequency": "daily",
    },
]


async def seed_kris():
    """Create E2E test KRIs linked to risks."""
    print("="*60)
    print("🔍 PHASE 179-04: KRI Data with Reporting Owners")
    print("="*60)
    
    async with async_session_maker() as db:
        users, _ = await load_mappings(db)
        
        created = 0
        skipped = 0
        
        for kri_data in KRIS:
            # Check if exists
            result = await db.execute(
                select(KeyRiskIndicator).where(KeyRiskIndicator.metric_name == kri_data["name"])
            )
            if result.scalar_one_or_none():
                skipped += 1
                continue
            
            # Make a copy
            data = kri_data.copy()
            
            # Get linked risk
            risk_code = data.pop("risk_code")
            result = await db.execute(
                select(Risk).where(Risk.risk_id_code == risk_code)
            )
            risk = result.scalar_one_or_none()
            if not risk:
                print(f"   ⚠️ Risk {risk_code} not found, skipping {data['name']}")
                continue
            
            # Resolve reporting owner
            reporting_owner_email = data.pop("reporting_owner")
            reporting_owner_id = users.get(reporting_owner_email)
            
            kri = KeyRiskIndicator(
                metric_name=data["name"],
                description=data["description"],
                risk_id=risk.id,
                reporting_owner_id=reporting_owner_id,
                unit=data["unit"],
                lower_limit=data["lower_limit"],
                upper_limit=data["upper_limit"],
                current_value=data["current_value"],
                frequency=data.get("frequency", "monthly"),
            )
            db.add(kri)
            created += 1
            print(f"   ✓ {data['name'][:50]}... → {risk_code}")
        
        await db.commit()
        
        print(f"\n✅ Created {created} KRIs, skipped {skipped} existing")


if __name__ == "__main__":
    asyncio.run(seed_kris())
