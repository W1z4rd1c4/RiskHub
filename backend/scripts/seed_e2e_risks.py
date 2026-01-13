"""
Phase 179-02: Cross-Department Risk Data
Creates 15 risks with cross-department ownership for E2E testing.
Based on Slavia Pojišťovna insurance operations.
"""
import asyncio
from sqlalchemy import select
from app.db.session import async_session_maker
from app.models import Risk
from scripts.e2e_mappings import load_mappings


RISKS = [
    # === Operations Department (3 risks) ===
    {
        "risk_id_code": "E2E-UW-001",
        "name": "Motor Policy Underpricing Risk",
        "description": "Risk of systematic underpricing in motor insurance policies leading to loss ratio deterioration",
        "process": "Underwriting",
        "subprocess": "Motor Insurance Pricing",
        "risk_type": "strategic",
        "category": "Underwriting Risk",
        "dept": "Operations",
        "owner": "ops.head@riskhub.local",
        "gross_probability": 4, "gross_impact": 5,
        "net_probability": 3, "net_impact": 5,
        "is_priority": True,
    },
    {
        "risk_id_code": "E2E-UW-002",
        "name": "Travel Insurance Claims Surge",
        "description": "Unexpected surge in travel insurance claims due to pandemic or geopolitical events",
        "process": "Claims",
        "subprocess": "Travel Claims Processing",
        "risk_type": "operational",
        "category": "Claims Risk",
        "dept": "Operations",
        "owner": "fin.head@riskhub.local",  # Cross-department owner!
        "gross_probability": 3, "gross_impact": 3,
        "net_probability": 2, "net_impact": 3,
        "is_priority": False,
    },
    {
        "risk_id_code": "E2E-UW-003",
        "name": "Property Damage Accumulation",
        "description": "Concentration of property insurance exposure in flood-prone areas",
        "process": "Underwriting",
        "subprocess": "Property Assessment",
        "risk_type": "operational",
        "category": "Underwriting Risk",
        "dept": "Operations",
        "owner": "ops.analyst@riskhub.local",
        "gross_probability": 2, "gross_impact": 3,
        "net_probability": 2, "net_impact": 2,
        "is_priority": False,
    },
    # === Finance Department (3 risks) ===
    {
        "risk_id_code": "E2E-CLM-001",
        "name": "Motor Claims Fraud Detection",
        "description": "Failure to detect fraudulent motor insurance claims leading to financial losses",
        "process": "Claims",
        "subprocess": "Fraud Detection",
        "risk_type": "operational",
        "category": "Fraud Risk",
        "dept": "Finance",
        "owner": "fin.head@riskhub.local",
        "gross_probability": 4, "gross_impact": 5,
        "net_probability": 4, "net_impact": 5,
        "is_priority": True,
    },
    {
        "risk_id_code": "E2E-CLM-002",
        "name": "Claims Reserve Inadequacy",
        "description": "Insufficient claims reserves leading to financial misstatement and solvency issues",
        "process": "Finance",
        "subprocess": "Reserving",
        "risk_type": "strategic",
        "category": "Reserving Risk",
        "dept": "Finance",
        "owner": "ops.head@riskhub.local",  # Cross-department owner!
        "gross_probability": 3, "gross_impact": 5,
        "net_probability": 3, "net_impact": 5,
        "is_priority": True,
    },
    {
        "risk_id_code": "E2E-CLM-003",
        "name": "Third-Party Vendor Data Breach",
        "description": "Data breach through claims processing vendor leading to customer data exposure",
        "process": "IT",
        "subprocess": "Vendor Management",
        "risk_type": "operational",
        "category": "Cyber Risk",
        "dept": "Finance",
        "owner": "it.head@riskhub.local",  # Cross-department owner!
        "gross_probability": 3, "gross_impact": 4,
        "net_probability": 2, "net_impact": 4,
        "is_priority": False,
    },
    # === IT Department (3 risks) ===
    {
        "risk_id_code": "E2E-IT-001",
        "name": "Ransomware Attack Disruption",
        "description": "Ransomware attack encrypting core insurance systems and customer data",
        "process": "IT",
        "subprocess": "Cybersecurity",
        "risk_type": "operational",
        "category": "Cyber Risk",
        "dept": "IT",
        "owner": "it.head@riskhub.local",
        "gross_probability": 4, "gross_impact": 5,
        "net_probability": 4, "net_impact": 5,
        "is_priority": True,
    },
    {
        "risk_id_code": "E2E-IT-002",
        "name": "Customer Data GDPR Violation",
        "description": "Breach of GDPR requirements in handling customer personal data",
        "process": "Compliance",
        "subprocess": "Data Protection",
        "risk_type": "strategic",
        "category": "Regulatory Risk",
        "dept": "IT",
        "owner": "fin.head@riskhub.local",  # Cross-department owner!
        "gross_probability": 3, "gross_impact": 5,
        "net_probability": 3, "net_impact": 4,
        "is_priority": True,
    },
    {
        "risk_id_code": "E2E-IT-003",
        "name": "Core Insurance System Downtime",
        "description": "Extended outage of policy administration system affecting customer service",
        "process": "IT",
        "subprocess": "System Availability",
        "risk_type": "operational",
        "category": "Operational Risk",
        "dept": "IT",
        "owner": "it.analyst@riskhub.local",
        "gross_probability": 3, "gross_impact": 3,
        "net_probability": 2, "net_impact": 3,
        "is_priority": False,
    },
    # === Compliance Department (3 risks) ===
    {
        "risk_id_code": "E2E-COMP-001",
        "name": "CNB Regulatory Non-Compliance",
        "description": "Failure to comply with Czech National Bank insurance regulations",
        "process": "Compliance",
        "subprocess": "Regulatory Reporting",
        "risk_type": "strategic",
        "category": "Regulatory Risk",
        "dept": "Compliance",
        "owner": "risk.manager@riskhub.local",
        "gross_probability": 3, "gross_impact": 5,
        "net_probability": 2, "net_impact": 4,
        "is_priority": True,
    },
    {
        "risk_id_code": "E2E-COMP-002",
        "name": "AML Transaction Monitoring Failure",
        "description": "Failure to detect suspicious transactions leading to AML violations",
        "process": "Compliance",
        "subprocess": "AML Screening",
        "risk_type": "operational",
        "category": "Regulatory Risk",
        "dept": "Compliance",
        "owner": "fin.head@riskhub.local",  # Cross-department owner!
        "gross_probability": 3, "gross_impact": 4,
        "net_probability": 2, "net_impact": 4,
        "is_priority": False,
    },
    {
        "risk_id_code": "E2E-COMP-003",
        "name": "Policy Document Template Errors",
        "description": "Errors in policy document templates leading to coverage disputes",
        "process": "Operations",
        "subprocess": "Document Management",
        "risk_type": "operational",
        "category": "Operational Risk",
        "dept": "Compliance",
        "owner": "ops.head@riskhub.local",  # Cross-department owner!
        "gross_probability": 2, "gross_impact": 3,
        "net_probability": 2, "net_impact": 2,
        "is_priority": False,
    },
    # === Risk Management Department (3 risks) ===
    {
        "risk_id_code": "E2E-RISK-001",
        "name": "Reinsurer Counterparty Default",
        "description": "Default of major reinsurance partner affecting claims recovery",
        "process": "Risk Management",
        "subprocess": "Reinsurance",
        "risk_type": "strategic",
        "category": "Counterparty Risk",
        "dept": "Risk Management",
        "owner": "risk.manager@riskhub.local",
        "gross_probability": 4, "gross_impact": 5,
        "net_probability": 4, "net_impact": 5,
        "is_priority": True,
    },
    {
        "risk_id_code": "E2E-RISK-002",
        "name": "Pricing Model Calibration Error",
        "description": "Errors in actuarial pricing models leading to systematic mispricing",
        "process": "Actuarial",
        "subprocess": "Model Validation",
        "risk_type": "operational",
        "category": "Model Risk",
        "dept": "Risk Management",
        "owner": "ops.head@riskhub.local",  # Cross-department owner!
        "gross_probability": 3, "gross_impact": 4,
        "net_probability": 3, "net_impact": 3,
        "is_priority": False,
    },
    {
        "risk_id_code": "E2E-RISK-003",
        "name": "Natural Catastrophe Exposure",
        "description": "Excessive exposure to natural catastrophe events exceeding reinsurance limits",
        "process": "Risk Management",
        "subprocess": "Catastrophe Modeling",
        "risk_type": "strategic",
        "category": "Catastrophe Risk",
        "dept": "Risk Management",
        "owner": "it.head@riskhub.local",  # Cross-department owner!
        "gross_probability": 2, "gross_impact": 5,
        "net_probability": 2, "net_impact": 3,
        "is_priority": False,
    },
]


async def seed_risks():
    """Create E2E test risks with cross-department ownership."""
    print("="*60)
    print("🔍 PHASE 179-02: Cross-Department Risk Data")
    print("="*60)
    
    async with async_session_maker() as db:
        users, depts = await load_mappings(db)
        
        created = 0
        skipped = 0
        cross_dept = 0
        
        for risk_data in RISKS:
            # Check if already exists
            result = await db.execute(
                select(Risk).where(Risk.risk_id_code == risk_data["risk_id_code"])
            )
            if result.scalar_one_or_none():
                skipped += 1
                continue
            
            # Make a copy to avoid modifying original
            data = risk_data.copy()
            
            # Resolve IDs
            owner_email = data.pop("owner")
            dept_name = data.pop("dept")
            owner_id = users[owner_email]
            dept_id = depts[dept_name]
            
            # Calculate scores
            gross_score = data["gross_probability"] * data["gross_impact"]
            net_score = data["net_probability"] * data["net_impact"]
            
            # Check if cross-department
            owner_dept_name = None
            for email, uid in users.items():
                if uid == owner_id:
                    # Get owner's department from the email pattern
                    if "ops" in email:
                        owner_dept_name = "Operations"
                    elif "fin" in email:
                        owner_dept_name = "Finance"
                    elif "it" in email:
                        owner_dept_name = "IT"
                    elif "risk" in email:
                        owner_dept_name = "Risk Management"
                    break
            
            is_cross_dept = owner_dept_name and owner_dept_name != dept_name
            if is_cross_dept:
                cross_dept += 1
            
            risk = Risk(
                **data,
                owner_id=owner_id,
                department_id=dept_id,
                gross_score=gross_score,
                net_score=net_score,
                status="active",
            )
            db.add(risk)
            created += 1
            print(f"   ✓ {data['risk_id_code']}: {data['name'][:50]}{'...' if len(data['name']) > 50 else ''}")
        
        await db.commit()
        
        priority_count = sum(1 for r in RISKS if r.get("is_priority"))
        print(f"\n✅ Created {created} risks, skipped {skipped} existing")
        print(f"   Cross-department owners: {cross_dept}/10")
        print(f"   Priority risks: {priority_count}/8")


if __name__ == "__main__":
    asyncio.run(seed_risks())
