"""
Phase 179-11: Deterministic Cross-Department Scenarios
Creates known user-entity ownership relationships across departments for predictable E2E tests.

These entities have deterministic owners from different departments than the entity's department,
enabling tests to verify cross-department access patterns reliably.
"""
import asyncio
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models import Risk, Control, KeyRiskIndicator
from scripts.e2e_mappings import (
    load_mappings_strict,
    require_department_id,
    require_user_id,
)


# Deterministic cross-department scenarios
# Each maps a user from one department to own an entity in another department
CROSS_DEPT_SCENARIOS = [
    # Finance user owns Operations risk
    {
        "scenario_name": "fin_owns_ops_risk",
        "owner_email": "fin.head@riskhub.local",
        "entity_type": "RISK",
        "entity_dept": "Operations",
        "risk_id_code": "XDEPT-001",
        "name": "E2E-XDEPT-FIN-OPS-RISK Cross-Department Finance-Ops Risk",
        "description": "Risk owned by Finance Head but hosted in Operations department",
    },
    # IT user owns Finance risk
    {
        "scenario_name": "it_owns_fin_risk",
        "owner_email": "it.head@riskhub.local",
        "entity_type": "RISK",
        "entity_dept": "Finance",
        "risk_id_code": "XDEPT-002",
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
        "linked_risk_code": "E2E-IT-001",
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
        users, depts = await load_mappings_strict(
            db,
            context="seed_e2e_cross_dept",
        )
        
        # Get CRO as created_by for all entities
        cro_id = require_user_id(users, "cro@riskhub.local")
        
        created = 0
        updated = 0
        
        for scenario in CROSS_DEPT_SCENARIOS:
            owner_id = require_user_id(users, scenario["owner_email"])
            dept_id = require_department_id(depts, scenario["entity_dept"])
            
            entity_type = scenario["entity_type"]
            name = scenario["name"]
            description = scenario["description"]
            
            if entity_type == "RISK":
                risk_id_code = scenario["risk_id_code"]
                existing = await db.execute(
                    select(Risk).where(Risk.risk_id_code == risk_id_code)
                )
                risk = existing.scalar_one_or_none()

                if risk:
                    needs_update = False
                    desired_fields = {
                        "name": name,
                        "description": description,
                        "process": "Cross-Department",
                        "subprocess": "Ownership Testing",
                        "risk_type": "operational",
                        "department_id": dept_id,
                        "owner_id": owner_id,
                        "category": "Operational",
                        "gross_probability": 3,
                        "gross_impact": 3,
                        "gross_score": 9,
                        "net_probability": 2,
                        "net_impact": 2,
                        "net_score": 4,
                        "status": "active",
                    }
                    for field, expected in desired_fields.items():
                        if getattr(risk, field) != expected:
                            setattr(risk, field, expected)
                            needs_update = True

                    if needs_update:
                        updated += 1
                        print(f"   ↺ RISK: {scenario['scenario_name']} (normalized)")
                    else:
                        print(f"   ⏭️  {name[:40]}... exists")
                    continue

                risk = Risk(
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
                db.add(risk)
                created += 1
                print(f"   ✓ RISK: {scenario['scenario_name']}")
            
            elif entity_type == "CONTROL":
                # Check if exists
                existing = await db.execute(
                    select(Control).where(Control.name == name)
                )
                existing_control = existing.scalar_one_or_none()
                if existing_control:
                    needs_update = False
                    if existing_control.control_form != "manual":
                        existing_control.control_form = "manual"
                        needs_update = True
                    if existing_control.frequency != "quarterly":
                        existing_control.frequency = "quarterly"
                        needs_update = True
                    if existing_control.department_id != dept_id:
                        existing_control.department_id = dept_id
                        needs_update = True
                    if existing_control.control_owner_id != owner_id:
                        existing_control.control_owner_id = owner_id
                        needs_update = True

                    if needs_update:
                        updated += 1
                        print(f"   ↺ CONTROL: {scenario['scenario_name']} (normalized)")
                    else:
                        print(f"   ⏭️  {name[:40]}... exists")
                    continue
                
                entity = Control(
                    name=name,
                    description=description,
                    department_id=dept_id,
                    control_owner_id=owner_id,
                    control_form="manual",
                    frequency="quarterly",
                    created_by_id=cro_id,
                )
                db.add(entity)
                created += 1
                print(f"   ✓ CONTROL: {scenario['scenario_name']}")
            
            elif entity_type == "KRI":
                linked_risk_code = scenario.get("linked_risk_code", "E2E-IT-001")
                linked_risk_result = await db.execute(
                    select(Risk).where(Risk.risk_id_code == linked_risk_code)
                )
                linked_risk = linked_risk_result.scalar_one_or_none()
                if not linked_risk:
                    raise RuntimeError(
                        f"Required linked risk '{linked_risk_code}' missing for scenario {scenario['scenario_name']}"
                    )

                # Check if exists
                existing = await db.execute(
                    select(KeyRiskIndicator).where(KeyRiskIndicator.metric_name == name)
                )
                kri = existing.scalar_one_or_none()
                if kri:
                    needs_update = False
                    desired_fields = {
                        "description": description,
                        "risk_id": linked_risk.id,
                        "reporting_owner_id": owner_id,
                        "unit": "%",
                        "frequency": "monthly",
                        "lower_limit": 20,
                        "upper_limit": 80,
                        "is_archived": False,
                        "archived_at": None,
                        "archived_by_id": None,
                    }
                    for field, expected in desired_fields.items():
                        if getattr(kri, field) != expected:
                            setattr(kri, field, expected)
                            needs_update = True

                    if needs_update:
                        updated += 1
                        print(f"   ↺ KRI: {scenario['scenario_name']} (normalized)")
                    else:
                        print(f"   ⏭️  {name[:40]}... exists")
                    continue

                kri = KeyRiskIndicator(
                    metric_name=name,
                    description=description,
                    risk_id=linked_risk.id,
                    reporting_owner_id=owner_id,
                    current_value=50.0,
                    unit="%",
                    frequency="monthly",
                    lower_limit=20,
                    upper_limit=80,
                )
                db.add(kri)
                created += 1
                print(f"   ✓ KRI: {scenario['scenario_name']}")
        
        await db.commit()
        print(f"\n✅ Cross-department entities: created={created}, updated={updated}")


if __name__ == "__main__":
    asyncio.run(seed_cross_dept_scenarios())
