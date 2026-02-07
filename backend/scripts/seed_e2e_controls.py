"""
Phase 179-03: Cross-Department Control Data
Creates 12 controls with risk linkages for E2E testing.
"""
import asyncio
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models import Control, Risk, ControlRiskLink, ControlStatus
from scripts.e2e_mappings import load_mappings, require_user_id, require_department_id


CONTROLS = [
    # === Operations Department (3 controls) ===
    {
        "name": "E2E-CTRL-001 Motor UW Pricing Validation",
        "description": "Automated validation of motor insurance pricing against actuarial models and market benchmarks",
        "dept": "Operations",
        "owner": "ops.analyst@riskhub.local",
        "risk_links": ["E2E-UW-001"],  # Priority risk!
        "frequency": "daily",
        "control_form": "automatic",
    },
    {
        "name": "E2E-CTRL-002 Travel Claims Surge Monitor",
        "description": "Real-time monitoring of travel claims volume with automated alerting for surge detection",
        "dept": "Operations",
        "owner": "fin.analyst@riskhub.local",  # Cross-department!
        "risk_links": ["E2E-UW-002"],
        "frequency": "daily",
        "control_form": "automatic",
    },
    {
        "name": "E2E-CTRL-003 Property Accumulation Check",
        "description": "Quarterly review of property insurance exposure concentration by geographic area",
        "dept": "Operations",
        "owner": "ops.head@riskhub.local",
        "risk_links": ["E2E-UW-003", "E2E-RISK-003"],  # Multiple links
        "frequency": "quarterly",
        "control_form": "manual",
    },
    # === Finance Department (2 controls) ===
    {
        "name": "E2E-CTRL-004 Fraud Detection Analytics",
        "description": "Machine learning-based fraud detection system analyzing claims patterns",
        "dept": "Finance",
        "owner": "fin.head@riskhub.local",
        "risk_links": ["E2E-CLM-001"],  # Priority risk!
        "frequency": "daily",
        "control_form": "automatic",
    },
    {
        "name": "E2E-CTRL-005 Reserve Adequacy Monthly Review",
        "description": "Monthly actuarial review of claims reserves against actual development",
        "dept": "Finance",
        "owner": "ops.analyst@riskhub.local",  # Cross-department!
        "risk_links": ["E2E-CLM-002"],  # Priority risk!
        "frequency": "monthly",
        "control_form": "manual",
    },
    # === IT Department (4 controls) ===
    {
        "name": "E2E-CTRL-006 Vendor Security Assessment",
        "description": "Annual security assessment of third-party vendors handling customer data",
        "dept": "IT",
        "owner": "it.head@riskhub.local",
        "risk_links": ["E2E-CLM-003", "E2E-IT-002"],  # One priority!
        "frequency": "annually",
        "control_form": "manual",
    },
    {
        "name": "E2E-CTRL-007 Endpoint Security Monitoring",
        "description": "24/7 endpoint detection and response monitoring for ransomware threats",
        "dept": "IT",
        "owner": "it.analyst@riskhub.local",
        "risk_links": ["E2E-IT-001"],  # Priority risk!
        "frequency": "continuous",
        "control_form": "automatic",
    },
    {
        "name": "E2E-CTRL-008 GDPR Compliance Validation",
        "description": "Quarterly data protection impact assessment and GDPR compliance check",
        "dept": "IT",
        "owner": "fin.analyst@riskhub.local",  # Cross-department!
        "risk_links": ["E2E-IT-002"],  # Priority risk!
        "frequency": "quarterly",
        "control_form": "manual",
    },
    {
        "name": "E2E-CTRL-009 Disaster Recovery Testing",
        "description": "Semi-annual disaster recovery and business continuity simulation",
        "dept": "IT",
        "owner": "it.head@riskhub.local",
        "risk_links": ["E2E-IT-003"],
        "frequency": "semi-annually",
        "control_form": "manual",
    },
    # === Compliance Department (3 controls) ===
    {
        "name": "E2E-CTRL-010 Regulatory Change Tracking",
        "description": "Continuous monitoring of CNB regulatory changes with impact assessment",
        "dept": "Compliance",
        "owner": "risk.manager@riskhub.local",
        "risk_links": ["E2E-COMP-001"],  # Priority risk!
        "frequency": "weekly",
        "control_form": "manual",
    },
    {
        "name": "E2E-CTRL-011 AML Transaction Screening",
        "description": "Automated AML screening of all financial transactions with manual review",
        "dept": "Compliance",
        "owner": "ops.analyst@riskhub.local",  # Cross-department!
        "risk_links": ["E2E-COMP-002"],
        "frequency": "daily",
        "control_form": "automatic",
    },
    {
        "name": "E2E-CTRL-012 Policy Document QA Check",
        "description": "Quality assurance review of policy document templates before release",
        "dept": "Compliance",
        "owner": "it.analyst@riskhub.local",  # Cross-department!
        "risk_links": ["E2E-COMP-003"],
        "frequency": "on-demand",
        "control_form": "manual",
    },
]

E2E_CONTROL_NAMES = tuple(control["name"] for control in CONTROLS)


async def seed_controls():
    """Create E2E test controls with risk linkages."""
    print("="*60)
    print("🔍 PHASE 179-03: Cross-Department Control Data")
    print("="*60)
    
    async with async_session_maker() as db:
        users, depts = await load_mappings(db)
        
        created_controls = 0
        created_links = 0
        skipped = 0
        
        for ctrl_data in CONTROLS:
            # Check if exists
            result = await db.execute(
                select(Control).where(Control.name == ctrl_data["name"])
            )
            if result.scalar_one_or_none():
                skipped += 1
                continue
            
            # Make a copy
            data = ctrl_data.copy()
            
            # Resolve IDs
            owner_email = data.pop("owner")
            dept_name = data.pop("dept")
            risk_codes = data.pop("risk_links")
            
            owner_id = require_user_id(users, owner_email)
            dept_id = require_department_id(depts, dept_name)
            
            control = Control(
                name=data["name"],
                description=data["description"],
                department_id=dept_id,
                control_owner_id=owner_id,
                frequency=data.get("frequency", "monthly"),
                control_form=data.get("control_form", "manual"),
                status=ControlStatus.active.value,
                risk_level=3,
            )
            db.add(control)
            await db.flush()  # Get control.id
            created_controls += 1
            
            # Create risk linkages
            for risk_code in risk_codes:
                result = await db.execute(
                    select(Risk).where(Risk.risk_id_code == risk_code)
                )
                risk = result.scalar_one_or_none()
                if not risk:
                    raise RuntimeError(
                        f"Deterministic control seed requires risk '{risk_code}', but it was not found."
                    )
                link = ControlRiskLink(
                    control_id=control.id,
                    risk_id=risk.id,
                    effectiveness="high",
                )
                db.add(link)
                created_links += 1
            
            print(f"   ✓ {data['name'][:55]}{'...' if len(data['name']) > 55 else ''}")
        
        await db.commit()
        
        print(f"\n✅ Created {created_controls} controls, {created_links} risk links")
        print(f"   Skipped {skipped} existing")
        return {"created": created_controls, "links_created": created_links, "skipped": skipped}


if __name__ == "__main__":
    asyncio.run(seed_controls())
