"""
Demo Seed Script - Seeds exactly 9 demo users matching the LoginPage configuration.

Creates:
- 9 users (IDs 1-9) with @riskhub.local emails
- 5 departments (Operations, Finance, IT, Compliance, Risk Management)
- Roles and permissions
- Sample risks, controls, and KRIs
"""

import asyncio

from passlib.context import CryptContext
from sqlalchemy import text

from app.core.config import get_settings
from app.db.rbac_seed_contract import (
    PERMISSION_BY_KEY,
    RBAC_ROLE_PERMISSIONS,
    ROLE_BY_NAME,
    expand_permission_keys,
)
from app.db.session import session_context
from app.models import Department, Permission, Role, RolePermission, User
from app.models.control import Control, ControlForm, ControlFrequency, ControlStatus
from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.risk import ControlEffectiveness, ControlRiskLink, Risk, RiskStatus, RiskType
from app.models.user import AccessScope

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEMO_PASSWORD = pwd_context.hash("test123")

# Match LoginPage.tsx DEMO_ACCOUNTS exactly
DEMO_USERS = [
    {
        "id": 1,
        "name": "System Admin",
        "email": "admin@riskhub.local",
        "role": "admin",
        "access": "global",
        "dept": None,
    },
    {"id": 2, "name": "Anna Kowalski", "email": "cro@riskhub.local", "role": "cro", "access": "global", "dept": None},
    {
        "id": 3,
        "name": "Petra Svobodová",
        "email": "risk.manager@riskhub.local",
        "role": "risk_manager",
        "access": "global",
        "dept": None,
    },
    {
        "id": 4,
        "name": "Eva Králová",
        "email": "ops.head@riskhub.local",
        "role": "department_head",
        "access": "department",
        "dept": "Operations",
    },
    {
        "id": 5,
        "name": "Martin Procházka",
        "email": "fin.head@riskhub.local",
        "role": "department_head",
        "access": "department",
        "dept": "Finance",
    },
    {
        "id": 6,
        "name": "Tomáš Novotný",
        "email": "it.head@riskhub.local",
        "role": "department_head",
        "access": "department",
        "dept": "IT",
    },
    {
        "id": 7,
        "name": "Jana Horáková",
        "email": "ops.analyst@riskhub.local",
        "role": "employee",
        "access": "department",
        "dept": "Operations",
    },
    {
        "id": 8,
        "name": "Lukáš Dvořák",
        "email": "fin.analyst@riskhub.local",
        "role": "employee",
        "access": "department",
        "dept": "Finance",
    },
    {
        "id": 9,
        "name": "Barbora Němcová",
        "email": "it.analyst@riskhub.local",
        "role": "employee",
        "access": "department",
        "dept": "IT",
    },
]

DEPARTMENTS = [
    {"name": "Operations", "code": "OPS"},
    {"name": "Finance", "code": "FIN"},
    {"name": "IT", "code": "IT"},
    {"name": "Compliance", "code": "CMP"},
    {"name": "Risk Management", "code": "RM"},
]

DEMO_ROLE_ORDER = (
    "admin",
    "cro",
    "risk_manager",
    "department_head",
    "employee",
)

ROLES = [dict(ROLE_BY_NAME[name]) for name in DEMO_ROLE_ORDER]
ROLE_PERMISSIONS = {role_name: tuple(RBAC_ROLE_PERMISSIONS[role_name]) for role_name in DEMO_ROLE_ORDER}

DEMO_PERMISSION_KEYS = sorted(
    expand_permission_keys(
        permission_key for permission_keys in ROLE_PERMISSIONS.values() for permission_key in permission_keys
    )
)
PERMISSIONS = [dict(PERMISSION_BY_KEY[key]) for key in DEMO_PERMISSION_KEYS]


async def seed_all():
    async with session_context(get_settings()) as db:
        print("=" * 60)
        print("🌱 DEMO SEED: Creating 9-user demo environment")
        print("=" * 60)

        # Reset sequences
        await db.execute(text("ALTER SEQUENCE users_id_seq RESTART WITH 1"))
        await db.execute(text("ALTER SEQUENCE departments_id_seq RESTART WITH 1"))
        await db.execute(text("ALTER SEQUENCE roles_id_seq RESTART WITH 1"))
        await db.execute(text("ALTER SEQUENCE permissions_id_seq RESTART WITH 1"))

        # === 1. CREATE DEPARTMENTS ===
        print("\n📁 Creating departments...")
        dept_map = {}
        for d in DEPARTMENTS:
            dept = Department(name=d["name"], code=d["code"], is_system=False)
            db.add(dept)
            await db.flush()
            dept_map[d["name"]] = dept.id
            print(f"   ✓ {d['name']} (ID: {dept.id})")

        # === 2. CREATE PERMISSIONS ===
        print("\n🔐 Creating permissions...")
        perm_map = {}
        for permission_data in PERMISSIONS:
            perm = Permission(**permission_data)
            db.add(perm)
            await db.flush()
            perm_key = f"{permission_data['resource']}:{permission_data['action']}"
            perm_map[perm_key] = perm.id
        print(f"   ✓ Created {len(PERMISSIONS)} permissions")

        # === 3. CREATE ROLES ===
        print("\n👔 Creating roles...")
        role_map = {}
        for role_data in ROLES:
            role = Role(**role_data)
            db.add(role)
            await db.flush()
            role_map[role_data["name"]] = role.id
            print(f"   ✓ {role_data['display_name']} (ID: {role.id})")

        # === 4. ASSIGN ROLE PERMISSIONS ===
        print("\n🔗 Assigning role permissions...")
        for role_name, permission_keys in ROLE_PERMISSIONS.items():
            role_id = role_map[role_name]
            assigned_count = 0
            for perm_key in permission_keys:
                if perm_key in perm_map:
                    rp = RolePermission(role_id=role_id, permission_id=perm_map[perm_key])
                    db.add(rp)
                    assigned_count += 1
                elif perm_key.endswith(":*"):
                    resource = perm_key.split(":", maxsplit=1)[0]
                    for candidate_key, permission_id in perm_map.items():
                        if candidate_key.startswith(f"{resource}:"):
                            rp = RolePermission(role_id=role_id, permission_id=permission_id)
                            db.add(rp)
                            assigned_count += 1
            print(f"   ✓ {role_name}: {assigned_count} permissions")

        # === 5. CREATE USERS ===
        print("\n👤 Creating users...")
        user_map = {}
        for u in DEMO_USERS:
            dept_id = dept_map.get(u["dept"]) if u["dept"] else dept_map["Risk Management"]
            user = User(
                name=u["name"],
                email=u["email"],
                hashed_password=DEMO_PASSWORD,
                role_id=role_map[u["role"]],
                department_id=dept_id,
                access_scope=AccessScope(u["access"]),
                is_active=True,
                employee_type="employee",
            )
            db.add(user)
            await db.flush()
            user_map[u["email"]] = user.id
            print(f"   ✓ {u['name']} (ID: {user.id}) - {u['role']}")

        # Verify IDs match expected
        for u in DEMO_USERS:
            actual_id = user_map[u["email"]]
            if actual_id != u["id"]:
                print(f"   ⚠️ WARNING: {u['email']} expected ID {u['id']}, got {actual_id}")

        # === 6. CREATE SAMPLE RISKS ===
        print("\n⚠️ Creating sample risks...")
        risks = [
            {
                "name": "Data Breach Risk",
                "process": "IT Security",
                "dept": "IT",
                "owner": "it.head@riskhub.local",
                "gross": 16,
                "net": 10,
                "priority": True,
            },
            {
                "name": "Financial Reporting Error",
                "process": "Finance",
                "dept": "Finance",
                "owner": "fin.head@riskhub.local",
                "gross": 12,
                "net": 8,
                "priority": False,
            },
            {
                "name": "Operational Downtime",
                "process": "Operations",
                "dept": "Operations",
                "owner": "ops.head@riskhub.local",
                "gross": 9,
                "net": 6,
                "priority": False,
            },
            {
                "name": "Compliance Violation",
                "process": "Compliance",
                "dept": "Compliance",
                "owner": "cro@riskhub.local",
                "gross": 20,
                "net": 12,
                "priority": True,
            },
            {
                "name": "Vendor Risk",
                "process": "Operations",
                "dept": "Operations",
                "owner": "ops.head@riskhub.local",
                "gross": 8,
                "net": 4,
                "priority": False,
            },
        ]
        risk_map = {}
        for r in risks:
            risk = Risk(
                name=r["name"],
                risk_id_code=f"{r['dept'][:3].upper()}-R{len(risk_map)+1:02d}",
                risk_type=RiskType.operational,
                process=r["process"],
                category="General",
                description=f"Sample risk: {r['name']}",
                gross_score=r["gross"],
                net_score=r["net"],
                is_priority=r["priority"],
                status=RiskStatus.active,
                department_id=dept_map[r["dept"]],
                owner_id=user_map[r["owner"]],
            )
            db.add(risk)
            await db.flush()
            risk_map[r["name"]] = risk.id
            print(f"   ✓ {r['name']} (ID: {risk.id})")

        # === 7. CREATE SAMPLE CONTROLS ===
        print("\n🛡️ Creating sample controls...")
        controls = [
            {"name": "Access Control Review", "dept": "IT", "owner": "it.analyst@riskhub.local", "freq": "monthly"},
            {
                "name": "Financial Reconciliation",
                "dept": "Finance",
                "owner": "fin.analyst@riskhub.local",
                "freq": "weekly",
            },
            {
                "name": "Operational Checklist",
                "dept": "Operations",
                "owner": "ops.analyst@riskhub.local",
                "freq": "daily",
            },
            {"name": "Compliance Audit", "dept": "Compliance", "owner": "cro@riskhub.local", "freq": "quarterly"},
            {"name": "Incident Response", "dept": "IT", "owner": "it.head@riskhub.local", "freq": "ad_hoc"},
        ]
        control_map = {}
        freq_map = {
            "daily": ControlFrequency.daily,
            "weekly": ControlFrequency.weekly,
            "monthly": ControlFrequency.monthly,
            "quarterly": ControlFrequency.quarterly,
            "ad_hoc": ControlFrequency.ad_hoc,
        }
        for c in controls:
            control = Control(
                name=c["name"],
                description=f"Sample control: {c['name']}",
                control_form=ControlForm.manual.value,
                frequency=freq_map[c["freq"]].value,
                status=ControlStatus.active.value,
                department_id=dept_map[c["dept"]],
                control_owner_id=user_map[c["owner"]],
            )
            db.add(control)
            await db.flush()
            control_map[c["name"]] = control.id
            print(f"   ✓ {c['name']} (ID: {control.id})")

        # === 8. LINK CONTROLS TO RISKS ===
        print("\n🔗 Linking controls to risks...")
        links = [
            ("Access Control Review", "Data Breach Risk"),
            ("Financial Reconciliation", "Financial Reporting Error"),
            ("Operational Checklist", "Operational Downtime"),
            ("Compliance Audit", "Compliance Violation"),
            ("Incident Response", "Data Breach Risk"),
            ("Incident Response", "Operational Downtime"),
        ]
        for control_name, risk_name in links:
            link = ControlRiskLink(
                control_id=control_map[control_name],
                risk_id=risk_map[risk_name],
                effectiveness=ControlEffectiveness.high.value,
            )
            db.add(link)
            print(f"   ✓ {control_name} → {risk_name}")

        # === 9. CREATE SAMPLE KRIs ===
        print("\n📊 Creating sample KRIs...")
        kris = [
            {
                "name": "System Uptime",
                "risk": "Operational Downtime",
                "owner": "ops.analyst@riskhub.local",
                "value": 99.5,
                "lower": 95,
                "upper": 100,
            },
            {
                "name": "Security Incidents",
                "risk": "Data Breach Risk",
                "owner": "it.analyst@riskhub.local",
                "value": 2,
                "lower": 0,
                "upper": 5,
            },
            {
                "name": "Audit Findings",
                "risk": "Compliance Violation",
                "owner": "cro@riskhub.local",
                "value": 3,
                "lower": 0,
                "upper": 10,
            },
            {
                "name": "Reconciliation Errors",
                "risk": "Financial Reporting Error",
                "owner": "fin.analyst@riskhub.local",
                "value": 1,
                "lower": 0,
                "upper": 3,
            },
        ]
        for k in kris:
            kri = KeyRiskIndicator(
                metric_name=k["name"],
                description=f"KRI: {k['name']}",
                risk_id=risk_map[k["risk"]],
                reporting_owner_id=user_map[k["owner"]],
                current_value=k["value"],
                lower_limit=k["lower"],
                upper_limit=k["upper"],
                unit="%",
                frequency=KRIFrequency.monthly.value,
            )
            db.add(kri)
            await db.flush()
            print(f"   ✓ {k['name']} (ID: {kri.id})")

        await db.commit()

        print("\n" + "=" * 60)
        print("✅ DEMO SEED COMPLETE!")
        print("=" * 60)
        print("\n📋 Summary:")
        print(f"   • {len(DEMO_USERS)} users")
        print(f"   • {len(DEPARTMENTS)} departments")
        print(f"   • {len(ROLES)} roles")
        print(f"   • {len(risks)} risks")
        print(f"   • {len(controls)} controls")
        print(f"   • {len(kris)} KRIs")
        print("\n🔑 Password for all demo accounts: test123")


if __name__ == "__main__":
    asyncio.run(seed_all())
