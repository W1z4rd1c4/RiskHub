"""
Phase 179-11: Deterministic Cross-Department Scenarios
Creates known user-entity ownership relationships across departments for predictable E2E tests.

These entities have deterministic owners from different departments than the entity's department,
enabling tests to verify cross-department access patterns reliably.
"""
import asyncio
from datetime import datetime, UTC
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models import Risk, Control, KeyRiskIndicator
from scripts.e2e_mappings import load_mappings


# Deterministic cross-department scenarios
# Each maps a user from one department to own an entity in another department
CROSS_DEPT_SCENARIOS = [
    # Finance user owns Operations risk
    {
        "scenario_name": "fin_owns_ops_risk",
        "owner_email": "fin.head@riskhub.local",
        "entity_type": "RISK",
        "entity_dept": "Operations",
        "name": "E2E-XDEPT-FIN-OPS-RISK Cross-Department Finance-Ops Risk",
        "description": "Risk owned by Finance Head but hosted in Operations department",
    },
    # IT user owns Finance risk
    {
        "scenario_name": "it_owns_fin_risk",
        "owner_email": "it.head@riskhub.local",
        "entity_type": "RISK",
        "entity_dept": "Finance",
        "name": "E2E-XDEPT-IT-FIN-RISK Cross-Department IT-Finance Risk",
        "description": "Risk owned by IT Head but hosted in Finance department",
    },
    # Operations analyst owns IT control
    {
        "scenario_name": "ops_owns_it_control",
        "owner_email": "ops.analyst@riskhub.local",
        "entity_type": "CONTROL",
        "entity_dept": "IT",
        "name": "E2E-XDEPT-OPS-IT-CTRL IT Control Owned by Ops",
        "description": "Control owned by Operations Analyst but hosted in IT department",
    },
    # IT analyst owns Operations control  
    {
        "scenario_name": "it_owns_ops_control",
        "owner_email": "it.analyst@riskhub.local",
        "entity_type": "CONTROL",
        "entity_dept": "Operations",
        "name": "E2E-XDEPT-IT-OPS-CTRL Ops Control Owned by IT",
        "description": "Control owned by IT Analyst but hosted in Operations department",
    },
    # Finance analyst reports on IT KRI
    {
        "scenario_name": "fin_reports_it_kri",
        "owner_email": "fin.analyst@riskhub.local",
        "entity_type": "KRI",
        "entity_dept": "IT",
        "name": "E2E-XDEPT-FIN-IT-KRI IT KRI Reported by Finance",
        "description": "KRI owned by Finance Analyst but linked to IT risk",
    },
]


async def seed_cross_dept_scenarios():
    """Seed deterministic cross-department ownership scenarios."""
    print("="*60)
    print("🔍 PHASE 179-11: Deterministic Cross-Department Scenarios")
    print("="*60)
    
    async with async_session_maker() as db:
        users, depts = await load_mappings(db)
        
        # Check if already seeded
        result = await db.execute(
            select(Risk).where(Risk.name.contains("E2E-XDEPT"))
        )
        if result.scalars().first():
            print("   ⏭️  Cross-department scenarios already seeded")
            return
        
        # Get CRO as created_by for all entities
        cro_id = users.get("cro@riskhub.local")
        
        # For KRIs, we need a linked risk - create one first
        kri_risk_result = await db.execute(
            select(Risk).where(Risk.name.contains("E2E")).limit(1)
        )
        kri_linked_risk = kri_risk_result.scalar_one_or_none()
        
        created = 0
        
        for scenario in CROSS_DEPT_SCENARIOS:
            owner_id = users.get(scenario["owner_email"])
            dept_id = depts.get(scenario["entity_dept"])
            
            if not owner_id or not dept_id:
                print(f"   ⚠️ Skipping {scenario['scenario_name']}: missing user/dept")
                continue
            
            entity_type = scenario["entity_type"]
            name = scenario["name"]
            description = scenario["description"]
            
            if entity_type == "RISK":
                # Check if exists
                existing = await db.execute(
                    select(Risk).where(Risk.name == name)
                )
                if existing.scalar_one_or_none():
                    print(f"   ⏭️  {name[:40]}... exists")
                    continue
                
                # Generate unique risk_id_code
                risk_id_code = f"XDEPT-{created+1:03d}"
                
                entity = Risk(
                    risk_id_code=risk_id_code,
                    name=name,
                    description=description,
                    process="Cross-Department",
                    subprocess="Ownership Testing",
                    risk_type="operational",
                    department_id=dept_id,
                    owner_id=owner_id,
                    category="Operational",
                    gross_probability=3,
                    gross_impact=3,
                    gross_score=9,
                    net_probability=2,
                    net_impact=2,
                    net_score=4,
                    status="active",
                )
                db.add(entity)
                created += 1
                print(f"   ✓ RISK: {scenario['scenario_name']}")
            
            elif entity_type == "CONTROL":
                # Check if exists
                existing = await db.execute(
                    select(Control).where(Control.name == name)
                )
                if existing.scalar_one_or_none():
                    print(f"   ⏭️  {name[:40]}... exists")
                    continue
                
                entity = Control(
                    name=name,
                    description=description,
                    department_id=dept_id,
                    control_owner_id=owner_id,
                    control_form="detective",
                    frequency="quarterly",
                    created_by_id=cro_id,
                )
                db.add(entity)
                created += 1
                print(f"   ✓ CONTROL: {scenario['scenario_name']}")
            
            elif entity_type == "KRI":
                # KRI needs a linked risk
                if not kri_linked_risk:
                    print(f"   ⚠️ Skipping {scenario['scenario_name']}: no linked risk")
                    continue
                
                # Check if exists
                existing = await db.execute(
                    select(KeyRiskIndicator).where(KeyRiskIndicator.metric_name == name)
                )
                if existing.scalar_one_or_none():
                    print(f"   ⏭️  {name[:40]}... exists")
                    continue
                
                entity = KeyRiskIndicator(
                    metric_name=name,
                    description=description,
                    risk_id=kri_linked_risk.id,
                    reporting_owner_id=owner_id,
                    unit="%",
                    frequency="monthly",
                    lower_limit=20,
                    upper_limit=80,
                )
                db.add(entity)
                created += 1
                print(f"   ✓ KRI: {scenario['scenario_name']}")
        
        await db.commit()
        print(f"\n✅ Created {created} cross-department entities")


if __name__ == "__main__":
    asyncio.run(seed_cross_dept_scenarios())
