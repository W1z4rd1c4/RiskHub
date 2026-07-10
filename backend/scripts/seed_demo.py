"""
Demo Seed Script - Seeds exactly 9 demo users matching the LoginPage configuration.

Creates:
- 9 users (IDs 1-9) with @riskhub.local emails
- 5 departments (Operations, Finance, IT, Compliance, Risk Management)
- Roles and permissions
- Sample risks, controls, and KRIs
"""

import asyncio

from sqlalchemy import select, text

from app.core.config import get_settings
from app.core.security import get_password_hash
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

DEMO_PASSWORD = get_password_hash("test123")

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

        # Align sequences with existing rows so demo inserts start at MAX(id)+1.
        # On an EMPTY table this yields id 1 (the original intent: demo users
        # land on IDs 1-9 to match LoginPage), but a blanket `RESTART WITH 1`
        # collides on a freshly alembic-migrated database where the
        # permission-sync migrations already inserted RBAC rows (roles /
        # permissions / role_permissions) and consumed sequence values.
        for table in ("users", "departments", "roles", "permissions"):
            await db.execute(
                text(
                    f"SELECT setval('{table}_id_seq', COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"
                )
            )

        # === 1. CREATE DEPARTMENTS (reuse existing by unique code) ===
        print("\n📁 Creating departments...")
        existing_departments = {
            dept.code: dept for dept in (await db.execute(select(Department))).scalars().all()
        }
        dept_map = {}
        for d in DEPARTMENTS:
            dept = existing_departments.get(d["code"])
            if dept is None:
                dept = Department(name=d["name"], code=d["code"], is_system=False)
                db.add(dept)
                await db.flush()
                existing_departments[d["code"]] = dept
            dept_map[d["name"]] = dept.id
            print(f"   ✓ {d['name']} (ID: {dept.id})")

        # === 2. CREATE PERMISSIONS (reuse existing by semantic (resource, action)) ===
        # The permission-sync migrations pre-insert RBAC permissions on a
        # freshly-migrated database, and (resource, action) has no unique
        # constraint, so unconditional inserts would silently duplicate rows.
        print("\n🔐 Creating permissions...")
        existing_permissions = {
            (perm.resource, perm.action): perm
            for perm in (await db.execute(select(Permission))).scalars().all()
        }
        perm_map = {}
        for permission_data in PERMISSIONS:
            natural_key = (permission_data["resource"], permission_data["action"])
            perm = existing_permissions.get(natural_key)
            if perm is None:
                perm = Permission(**permission_data)
                db.add(perm)
                await db.flush()
                existing_permissions[natural_key] = perm
            perm_key = f"{permission_data['resource']}:{permission_data['action']}"
            perm_map[perm_key] = perm.id
        print(f"   ✓ Ensured {len(PERMISSIONS)} permissions")

        # === 3. CREATE ROLES (reuse existing by unique name) ===
        print("\n👔 Creating roles...")
        existing_roles = {
            role.name: role for role in (await db.execute(select(Role))).scalars().all()
        }
        role_map = {}
        for role_data in ROLES:
            role = existing_roles.get(role_data["name"])
            if role is None:
                role = Role(**role_data)
                db.add(role)
                await db.flush()
                existing_roles[role_data["name"]] = role
            role_map[role_data["name"]] = role.id
            print(f"   ✓ {role_data['display_name']} (ID: {role.id})")

        # === 4. ASSIGN ROLE PERMISSIONS (reuse existing by (role_id, permission_id)) ===
        print("\n🔗 Assigning role permissions...")
        existing_grants = {
            (rp.role_id, rp.permission_id)
            for rp in (await db.execute(select(RolePermission))).scalars().all()
        }

        def _ensure_grant(role_id: int, permission_id: int) -> bool:
            if (role_id, permission_id) in existing_grants:
                return False
            db.add(RolePermission(role_id=role_id, permission_id=permission_id))
            existing_grants.add((role_id, permission_id))
            return True

        for role_name, permission_keys in ROLE_PERMISSIONS.items():
            role_id = role_map[role_name]
            assigned_count = 0
            for perm_key in permission_keys:
                if perm_key in perm_map:
                    if _ensure_grant(role_id, perm_map[perm_key]):
                        assigned_count += 1
                elif perm_key.endswith(":*"):
                    resource = perm_key.split(":", maxsplit=1)[0]
                    for candidate_key, permission_id in perm_map.items():
                        if candidate_key.startswith(f"{resource}:"):
                            if _ensure_grant(role_id, permission_id):
                                assigned_count += 1
            print(f"   ✓ {role_name}: {assigned_count} permissions")

        # === 5. CREATE USERS (reuse existing by unique email) ===
        print("\n👤 Creating users...")
        existing_users = {
            user.email: user for user in (await db.execute(select(User))).scalars().all()
        }
        user_map = {}
        for u in DEMO_USERS:
            dept_id = dept_map.get(u["dept"]) if u["dept"] else dept_map["Risk Management"]
            user = existing_users.get(u["email"])
            if user is None:
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
                existing_users[u["email"]] = user
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
        existing_risks = {
            risk.risk_id_code: risk for risk in (await db.execute(select(Risk))).scalars().all()
        }
        risk_map = {}
        for r in risks:
            risk_code = f"{r['dept'][:3].upper()}-R{len(risk_map)+1:02d}"
            risk = existing_risks.get(risk_code)
            if risk is None:
                risk = Risk(
                    name=r["name"],
                    risk_id_code=risk_code,
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
                existing_risks[risk_code] = risk
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
        existing_controls = {
            control.name: control for control in (await db.execute(select(Control))).scalars().all()
        }
        for c in controls:
            control = existing_controls.get(c["name"])
            if control is None:
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
                existing_controls[c["name"]] = control
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
        existing_links = {
            (link.control_id, link.risk_id)
            for link in (await db.execute(select(ControlRiskLink))).scalars().all()
        }
        for control_name, risk_name in links:
            link_key = (control_map[control_name], risk_map[risk_name])
            if link_key in existing_links:
                continue
            db.add(
                ControlRiskLink(
                    control_id=link_key[0],
                    risk_id=link_key[1],
                    effectiveness=ControlEffectiveness.high.value,
                )
            )
            existing_links.add(link_key)
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
        existing_kris = {
            (kri.metric_name, kri.risk_id)
            for kri in (await db.execute(select(KeyRiskIndicator))).scalars().all()
        }
        for k in kris:
            kri_risk_id = risk_map[k["risk"]]
            if (k["name"], kri_risk_id) in existing_kris:
                continue
            kri = KeyRiskIndicator(
                metric_name=k["name"],
                description=f"KRI: {k['name']}",
                risk_id=kri_risk_id,
                reporting_owner_id=user_map[k["owner"]],
                current_value=k["value"],
                lower_limit=k["lower"],
                upper_limit=k["upper"],
                unit="%",
                frequency=KRIFrequency.monthly.value,
            )
            db.add(kri)
            await db.flush()
            existing_kris.add((k["name"], kri_risk_id))
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
