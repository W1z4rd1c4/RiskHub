"""Seed script to populate database with initial data."""
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker
from app.models import Role, Permission, RolePermission, User, Department


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

# Base permissions
PERMISSIONS = [
    {"resource": "*", "action": "*", "description": "Full access to all resources"},
    {"resource": "controls", "action": "read", "description": "View controls"},
    {"resource": "controls", "action": "write", "description": "Create/edit controls"},
    {"resource": "controls", "action": "delete", "description": "Delete controls"},
    {"resource": "controls", "action": "approve", "description": "Approve control changes"},
    {"resource": "departments", "action": "read", "description": "View departments"},
    {"resource": "departments", "action": "write", "description": "Create/edit departments"},
    {"resource": "reports", "action": "read", "description": "View reports"},
    {"resource": "reports", "action": "export", "description": "Export reports"},
    {"resource": "users", "action": "read", "description": "View users"},
    {"resource": "users", "action": "write", "description": "Manage users"},
]

# Role-permission mappings
ROLE_PERMISSIONS = {
    "admin": ["*:*"],
    "cro": ["*:*"],
    "risk_manager": ["controls:*", "departments:read", "reports:*", "users:read"],
    "actuarial": ["controls:read", "controls:write", "reports:read"],
    "compliance": ["controls:read", "controls:write", "reports:read"],
    "internal_audit": ["controls:read", "departments:read", "reports:read"],
    "department_head": ["controls:read", "controls:write", "departments:read", "reports:read"],
    "control_owner": ["controls:read", "controls:write"],
    "viewer": ["controls:read", "departments:read", "reports:read"],
}

# Sample departments
DEPARTMENTS = [
    {"name": "Operations", "code": "OPS", "description": "Operations department"},
    {"name": "Finance", "code": "FIN", "description": "Finance and accounting"},
    {"name": "IT", "code": "IT", "description": "Information technology"},
    {"name": "Risk Management", "code": "RISK", "description": "Risk management function"},
    {"name": "Compliance", "code": "COMP", "description": "Compliance function"},
]

# Test users
TEST_USERS = [
    {"email": "admin@riskhub.local", "name": "System Admin", "role": "admin", "department": None},
    {"email": "cro@riskhub.local", "name": "Jan Novák", "role": "cro", "department": "RISK"},
    {"email": "risk.manager@riskhub.local", "name": "Petra Svobodová", "role": "risk_manager", "department": "RISK"},
    {"email": "auditor@riskhub.local", "name": "Martin Horák", "role": "internal_audit", "department": None},
    {"email": "ops.head@riskhub.local", "name": "Eva Králová", "role": "department_head", "department": "OPS"},
]


async def seed_database():
    """Seed the database with initial data."""
    async with async_session_maker() as db:
        # Check if already seeded
        result = await db.execute(select(Role))
        if result.scalars().first():
            print("Database already seeded. Skipping.")
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
        await db.flush()
        print(f"Created {len(TEST_USERS)} test users")
        
        await db.commit()
        print("Database seeding complete!")


if __name__ == "__main__":
    asyncio.run(seed_database())
