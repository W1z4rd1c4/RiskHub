"""Seed script to populate database with initial data."""
import asyncio
from datetime import datetime, timedelta, UTC
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker
from app.models import Role, Permission, RolePermission, User, Department
from app.models import Control, ControlExecution, Risk, ControlRiskLink


# SII-compliant roles
ROLES = [
    {"name": "admin", "display_name": "Administrator", "description": "System administration, full access"},
    {"name": "cro", "display_name": "Chief Risk Officer", "description": "Full access, risk oversight, reporting"},
    {"name": "risk_manager", "display_name": "Risk Manager", "description": "Risk register management, control oversight"},
    {"name": "actuarial", "display_name": "Actuarial Function", "description": "Actuarial controls, reserving oversight"},
    {"name": "compliance", "display_name": "Compliance Officer", "description": "Regulatory compliance, policy controls"},
    {"name": "internal_audit", "display_name": "Internal Audit", "description": "Read-only audit access, verification rights"},
    {"name": "department_head", "display_name": "Department Head", "description": "Department control catalog ownership"},
    {"name": "control_owner", "display_name": "Control Owner", "description": "Specific control management and execution"},
    {"name": "viewer", "display_name": "Viewer", "description": "Read-only dashboard access"},
]

# Base permissions (add risks permissions)
PERMISSIONS = [
    {"resource": "*", "action": "*", "description": "Full access to all resources"},
    {"resource": "controls", "action": "read", "description": "View controls"},
    {"resource": "controls", "action": "write", "description": "Create/edit controls"},
    {"resource": "controls", "action": "delete", "description": "Delete controls"},
    {"resource": "controls", "action": "approve", "description": "Approve control changes"},
    {"resource": "risks", "action": "read", "description": "View risks"},
    {"resource": "risks", "action": "write", "description": "Create/edit risks"},
    {"resource": "risks", "action": "delete", "description": "Delete risks"},
    {"resource": "departments", "action": "read", "description": "View departments"},
    {"resource": "departments", "action": "write", "description": "Create/edit departments"},
    {"resource": "reports", "action": "read", "description": "View and export reports"},
    {"resource": "users", "action": "read", "description": "View users"},
    {"resource": "users", "action": "write", "description": "Manage users"},
]

# Role-permission mappings
ROLE_PERMISSIONS = {
    "admin": ["*:*"],
    "cro": ["*:*"],
    "risk_manager": ["controls:*", "risks:*", "departments:read", "reports:*", "users:read", "approvals:write"],
    "actuarial": ["controls:read", "controls:write", "risks:read", "reports:read"],
    "compliance": ["controls:read", "controls:write", "risks:read", "reports:read"],
    "internal_audit": ["controls:read", "risks:read", "departments:read", "reports:read"],
    "department_head": ["controls:read", "controls:write", "risks:read", "departments:read", "reports:read"],
    "control_owner": ["controls:read", "controls:write", "risks:read"],
    "viewer": ["controls:read", "risks:read", "departments:read", "reports:read"],
}

# Sample departments
DEPARTMENTS = [
    {"name": "Operations", "code": "OPS", "description": "Operations department"},
    {"name": "Finance", "code": "FIN", "description": "Finance and accounting"},
    {"name": "IT", "code": "IT", "description": "Information technology"},
    {"name": "Risk Management", "code": "RISK", "description": "Risk management function"},
    {"name": "Compliance", "code": "COMP", "description": "Compliance function"},
]

# Demo users - structured for testing different permission levels
# ID 1-3: Privileged accounts (full access)
# ID 4-6: Department heads (department-scoped write access)
# ID 7-9: Employees (limited access under department heads)
TEST_USERS = [
    # Privileged accounts
    {"email": "admin@riskhub.local", "name": "System Admin", "role": "admin", "department": None},
    {"email": "cro@riskhub.local", "name": "Anna Kowalski", "role": "cro", "department": "RISK"},
    {"email": "risk.manager@riskhub.local", "name": "Petra Svobodová", "role": "risk_manager", "department": "RISK"},
    # Department heads
    {"email": "ops.head@riskhub.local", "name": "Eva Králová", "role": "department_head", "department": "OPS"},
    {"email": "fin.head@riskhub.local", "name": "Martin Procházka", "role": "department_head", "department": "FIN"},
    {"email": "it.head@riskhub.local", "name": "Tomáš Novotný", "role": "department_head", "department": "IT"},
    # Employees (control owners under department heads)
    {"email": "ops.analyst@riskhub.local", "name": "Jana Horáková", "role": "control_owner", "department": "OPS"},
    {"email": "fin.analyst@riskhub.local", "name": "Lukáš Dvořák", "role": "control_owner", "department": "FIN"},
    {"email": "it.analyst@riskhub.local", "name": "Barbora Němcová", "role": "control_owner", "department": "IT"},
]

# Sample controls based on DEFINICIA KONTROL
SAMPLE_CONTROLS = [
    {
        "name": "Daily Cash Reconciliation",
        "description": "Verify daily cash balances against bank statements",
        "data_source": "Bank statements, ERP system",
        "methodology_reference": "OS-FIN-001",
        "control_form": "manual",
        "process_owner_position": "Finance Director",
        "executor_position": "Financial Analyst",
        "frequency": "daily",
        "risk_level": 4,
        "output_description": "Reconciliation report with variances",
        "report_recipient": "CFO, Finance Director",
        "documentation_location": "SharePoint/Finance/Reconciliation",
        "department": "FIN",
        "status": "active",
    },
    {
        "name": "IT Access Review",
        "description": "Quarterly review of user access rights to critical systems",
        "data_source": "Active Directory, Application access logs",
        "methodology_reference": "OS-IT-015",
        "control_form": "manual",
        "process_owner_position": "IT Security Manager",
        "executor_position": "IT Security Analyst",
        "frequency": "quarterly",
        "risk_level": 5,
        "output_description": "Access review report with remediation actions",
        "report_recipient": "CISO, IT Director",
        "documentation_location": "SharePoint/IT/Security/AccessReviews",
        "department": "IT",
        "status": "active",
    },
    {
        "name": "Insurance Policy Underwriting Check",
        "description": "Automated validation of policy underwriting parameters",
        "data_source": "Underwriting system",
        "methodology_reference": "OS-OPS-022",
        "control_form": "automatic",
        "process_owner_position": "Chief Underwriter",
        "executor_position": "System",
        "frequency": "daily",
        "risk_level": 5,
        "output_description": "Exception report for out-of-policy underwriting",
        "report_recipient": "Chief Underwriter, Risk Manager",
        "documentation_location": "UW System logs",
        "department": "OPS",
        "status": "active",
    },
    {
        "name": "Regulatory Compliance Monitoring",
        "description": "Monthly review of regulatory changes and compliance status",
        "data_source": "Regulatory bulletins, Internal compliance database",
        "methodology_reference": "OS-COMP-003",
        "control_form": "manual",
        "process_owner_position": "Compliance Officer",
        "executor_position": "Compliance Analyst",
        "frequency": "monthly",
        "risk_level": 4,
        "output_description": "Compliance status report with action items",
        "report_recipient": "CRO, Board",
        "documentation_location": "SharePoint/Compliance/Monthly",
        "department": "COMP",
        "status": "active",
    },
    {
        "name": "Claims Reserve Validation",
        "description": "Actuarial review of claims reserves accuracy",
        "data_source": "Claims system, Actuarial models",
        "methodology_reference": "OS-FIN-045",
        "control_form": "manual",
        "process_owner_position": "Chief Actuary",
        "executor_position": "Senior Actuary",
        "frequency": "quarterly",
        "risk_level": 5,
        "output_description": "Reserve adequacy report",
        "report_recipient": "CFO, Audit Committee",
        "documentation_location": "SharePoint/Actuarial/Reserves",
        "department": "FIN",
        "status": "active",
    },
    {
        "name": "Vendor Invoice Approval",
        "description": "Three-way matching of PO, receipt, and invoice before payment",
        "data_source": "ERP system, Purchase orders",
        "methodology_reference": "OS-FIN-012",
        "control_form": "automatic",
        "process_owner_position": "Finance Manager",
        "executor_position": "System",
        "frequency": "daily",
        "risk_level": 3,
        "output_description": "Approved/rejected invoice list",
        "report_recipient": "Finance Manager",
        "documentation_location": "ERP audit trail",
        "department": "FIN",
        "status": "active",
    },
]

# Sample risks based on OS 18 Registr rizik
SAMPLE_RISKS = [
    {
        "risk_id_code": "FIN-R01",
        "process": "Finance",
        "subprocess": "Cash Management",
        "risk_type": "operational",
        "category": "Operational Risk",
        "description": "Cash flow mismanagement leading to liquidity issues",
        "gross_probability": 3,
        "gross_impact": 4,
        "net_probability": 2,
        "net_impact": 3,
        "department": "FIN",
        "is_priority": True,
        "kri_indicator": "Days Cash on Hand",
        "kri_threshold_green": "> 60 days",
        "kri_threshold_yellow": "30-60 days",
        "kri_threshold_red": "< 30 days",
    },
    {
        "risk_id_code": "IT-R01",
        "process": "IT",
        "subprocess": "Access Control",
        "risk_type": "operational",
        "category": "Cyber Risk",
        "description": "Unauthorized access to critical systems",
        "gross_probability": 4,
        "gross_impact": 5,
        "net_probability": 2,
        "net_impact": 4,
        "department": "IT",
        "is_priority": True,
        "kri_indicator": "Failed login attempts",
        "kri_threshold_green": "< 10 per day",
        "kri_threshold_yellow": "10-50 per day",
        "kri_threshold_red": "> 50 per day",
    },
    {
        "risk_id_code": "UW-R01",
        "process": "Underwriting",
        "subprocess": "Policy Issuance",
        "risk_type": "strategic",
        "category": "Underwriting Risk",
        "description": "Underpricing of policies leading to loss ratio deterioration",
        "gross_probability": 3,
        "gross_impact": 5,
        "net_probability": 2,
        "net_impact": 4,
        "department": "OPS",
        "is_priority": True,
        "kri_indicator": "Loss Ratio",
        "kri_threshold_green": "< 65%",
        "kri_threshold_yellow": "65-75%",
        "kri_threshold_red": "> 75%",
    },
    {
        "risk_id_code": "COMP-R01",
        "process": "Compliance",
        "subprocess": "Regulatory",
        "risk_type": "strategic",
        "category": "Regulatory Risk",
        "description": "Non-compliance with regulatory requirements",
        "gross_probability": 2,
        "gross_impact": 5,
        "net_probability": 1,
        "net_impact": 4,
        "department": "COMP",
        "is_priority": False,
        "kri_indicator": "Open compliance gaps",
        "kri_threshold_green": "0",
        "kri_threshold_yellow": "1-3",
        "kri_threshold_red": "> 3",
    },
    {
        "risk_id_code": "FIN-R02",
        "process": "Finance",
        "subprocess": "Reserving",
        "risk_type": "operational",
        "category": "Reserving Risk",
        "description": "Inadequate claims reserves leading to financial misstatement",
        "gross_probability": 3,
        "gross_impact": 5,
        "net_probability": 2,
        "net_impact": 3,
        "department": "FIN",
        "is_priority": True,
        "kri_indicator": "Reserve Adequacy Ratio",
        "kri_threshold_green": "95-105%",
        "kri_threshold_yellow": "90-95% or 105-110%",
        "kri_threshold_red": "< 90% or > 110%",
    },
]

# Control-Risk links (control index, risk index, effectiveness)
CONTROL_RISK_LINKS = [
    (0, 0, "high", "Daily reconciliation directly monitors cash"),
    (1, 1, "high", "Access review prevents unauthorized access"),
    (2, 2, "high", "Automated checks prevent underpricing"),
    (3, 3, "high", "Regular monitoring ensures compliance"),
    (4, 4, "high", "Reserve validation ensures adequacy"),
    (5, 0, "medium", "Invoice approval affects cash outflow"),
]


async def seed_database():
    """Seed the database with initial data."""
    async with async_session_maker() as db:
        # Check if already seeded
        result = await db.execute(select(Role))
        if result.scalars().first():
            print("Database already seeded. Skipping roles/permissions/users.")
            # Still check and seed controls/risks if missing
            result = await db.execute(select(Control))
            if not result.scalars().first():
                await seed_controls_and_risks(db)
            return
        
        print("Seeding database...")
        
        # Create permissions
        permissions = {}
        for perm_data in PERMISSIONS:
            perm = Permission(**perm_data)
            db.add(perm)
            permissions[f"{perm_data['resource']}:{perm_data['action']}"] = perm
        await db.flush()
        print(f"Created {len(PERMISSIONS)} permissions")
        
        # Create roles
        roles = {}
        for role_data in ROLES:
            role = Role(**role_data)
            db.add(role)
            roles[role_data["name"]] = role
        await db.flush()
        print(f"Created {len(ROLES)} roles")
        
        # Create role-permission mappings
        for role_name, perm_keys in ROLE_PERMISSIONS.items():
            role = roles[role_name]
            for perm_key in perm_keys:
                if perm_key in permissions:
                    rp = RolePermission(role_id=role.id, permission_id=permissions[perm_key].id)
                    db.add(rp)
                elif perm_key.endswith(":*"):
                    # Handle wildcard action permissions
                    resource = perm_key.split(":")[0]
                    for key, perm in permissions.items():
                        if key.startswith(f"{resource}:"):
                            rp = RolePermission(role_id=role.id, permission_id=perm.id)
                            db.add(rp)
        await db.flush()
        print("Created role-permission mappings")
        
        # Create departments
        departments = {}
        for dept_data in DEPARTMENTS:
            dept = Department(**dept_data)
            db.add(dept)
            departments[dept_data["code"]] = dept
        await db.flush()
        print(f"Created {len(DEPARTMENTS)} departments")
        
        # Create test users
        users = {}
        for user_data in TEST_USERS:
            role = roles[user_data["role"]]
            dept = departments.get(user_data["department"]) if user_data["department"] else None
            user = User(
                email=user_data["email"],
                name=user_data["name"],
                role_id=role.id,
                department_id=dept.id if dept else None,
                is_active=True,
            )
            db.add(user)
            users[user_data["email"]] = user
        await db.flush()
        print(f"Created {len(TEST_USERS)} test users")
        
        await db.commit()
        
        # Seed controls and risks
        await seed_controls_and_risks(db)
        
        print("Database seeding complete!")


async def seed_controls_and_risks(db: AsyncSession):
    """Seed controls, risks, and their links."""
    # Get departments and users for FK references
    result = await db.execute(select(Department))
    departments = {d.code: d for d in result.scalars().all()}
    
    result = await db.execute(select(User))
    users = list(result.scalars().all())
    admin_user = users[0] if users else None
    
    # Create controls
    controls = []
    for ctrl_data in SAMPLE_CONTROLS:
        dept = departments.get(ctrl_data.pop("department"))
        control = Control(
            **ctrl_data,
            department_id=dept.id if dept else None,
            control_owner_id=admin_user.id if admin_user else None,
            created_by_id=admin_user.id if admin_user else None,
            updated_by_id=admin_user.id if admin_user else None,
        )
        db.add(control)
        controls.append(control)
    await db.flush()
    print(f"Created {len(SAMPLE_CONTROLS)} sample controls")
    
    # Create sample executions for first 3 controls
    for i, control in enumerate(controls[:3]):
        for days_ago in [30, 15, 0]:
            exec_time = datetime.now() - timedelta(days=days_ago)
            execution = ControlExecution(
                control_id=control.id,
                executed_by_id=admin_user.id if admin_user else None,
                executed_at=exec_time,
                result="passed",
                findings=None if days_ago == 0 else "No issues found",
                notes=f"Routine execution - day {30 - days_ago}",
                next_scheduled=exec_time + timedelta(days=30),
            )
            db.add(execution)
    await db.flush()
    print("Created sample control executions")
    
    # Create risks
    risks = []
    for risk_data in SAMPLE_RISKS:
        dept = departments.get(risk_data.pop("department"))
        gross_score = risk_data["gross_probability"] * risk_data["gross_impact"]
        net_score = risk_data["net_probability"] * risk_data["net_impact"]
        risk = Risk(
            **risk_data,
            gross_score=gross_score,
            net_score=net_score,
            status="active",
            department_id=dept.id if dept else None,
            owner_id=admin_user.id if admin_user else None,
        )
        db.add(risk)
        risks.append(risk)
    await db.flush()
    print(f"Created {len(SAMPLE_RISKS)} sample risks")
    
    # Create control-risk links
    for ctrl_idx, risk_idx, effectiveness, notes in CONTROL_RISK_LINKS:
        link = ControlRiskLink(
            control_id=controls[ctrl_idx].id,
            risk_id=risks[risk_idx].id,
            effectiveness=effectiveness,
            notes=notes,
        )
        db.add(link)
    await db.flush()
    print(f"Created {len(CONTROL_RISK_LINKS)} control-risk links")
    
    await db.commit()


if __name__ == "__main__":
    asyncio.run(seed_database())

