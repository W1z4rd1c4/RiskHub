"""Seed script to populate database with initial data."""

import asyncio
from datetime import timedelta
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.rbac_seed_contract import (
    RBAC_PERMISSIONS as PERMISSIONS,
)
from app.db.rbac_seed_contract import (
    RBAC_ROLE_PERMISSIONS as ROLE_PERMISSIONS,
)
from app.db.rbac_seed_contract import (
    RBAC_ROLES as ROLES,
)
from app.db.seed_data import CONTROL_RISK_LINKS, DEPARTMENTS, SAMPLE_CONTROLS, SAMPLE_RISKS, TEST_USERS
from app.db.session import session_context
from app.models import (
    Control,
    ControlExecution,
    ControlRiskLink,
    Department,
    Permission,
    Risk,
    RiskTypeConfig,
    Role,
    RolePermission,
    User,
)
from app.models.user import AccessScope

DEFAULT_RISK_TYPES = (
    {
        "code": "operational",
        "display_name": "Operational",
        "description": "Operational risk",
        "color": "#3b82f6",
        "is_system": True,
        "sort_order": 1,
    },
    {
        "code": "strategic",
        "display_name": "Strategic",
        "description": "Strategic risk",
        "color": "#8b5cf6",
        "is_system": True,
        "sort_order": 2,
    },
)

RiskTypeSeed = dict[str, str | bool | int]
SeedPayload = dict[str, Any]


def _risk_type_text_missing(value: str | None) -> bool:
    return value is None or not value.strip()


def _format_risk_type_seed_summary(summary: dict[str, int]) -> str:
    return f"created={summary['created']}, repaired={summary['repaired']}"


async def seed_default_risk_types(db: AsyncSession) -> dict[str, int]:
    """Ensure the canonical system risk types exist and remain usable."""
    risk_type_defaults = cast(tuple[RiskTypeSeed, ...], DEFAULT_RISK_TYPES)
    result = await db.execute(
        select(RiskTypeConfig).where(
            RiskTypeConfig.code.in_([cast(str, risk_type["code"]) for risk_type in risk_type_defaults])
        )
    )
    existing_by_code = {risk_type.code: risk_type for risk_type in result.scalars().all()}
    summary = {"created": 0, "repaired": 0}

    for risk_type_default in risk_type_defaults:
        existing = existing_by_code.get(cast(str, risk_type_default["code"]))
        if existing is None:
            db.add(RiskTypeConfig(**risk_type_default))
            summary["created"] += 1
            continue

        repaired = False
        if not existing.is_active:
            existing.is_active = True
            repaired = True
        if not existing.is_system:
            existing.is_system = True
            repaired = True
        if _risk_type_text_missing(existing.display_name):
            existing.display_name = cast(str, risk_type_default["display_name"])
            repaired = True
        if _risk_type_text_missing(existing.description):
            existing.description = cast(str, risk_type_default["description"])
            repaired = True
        if _risk_type_text_missing(existing.color):
            existing.color = cast(str, risk_type_default["color"])
            repaired = True
        if existing.sort_order is None:
            existing.sort_order = cast(int, risk_type_default["sort_order"])
            repaired = True
        if repaired:
            summary["repaired"] += 1

    if summary["created"] or summary["repaired"]:
        await db.flush()

    return summary


async def seed_database():
    """Seed the database with initial data."""
    async with session_context(get_settings()) as db:
        # Check if already seeded
        result = await db.execute(select(Role))
        if result.scalars().first():
            print("Database already seeded. Skipping roles/permissions/users.")
            risk_type_summary = await seed_default_risk_types(db)
            if risk_type_summary["created"] or risk_type_summary["repaired"]:
                print(f"Reconciled default risk types ({_format_risk_type_seed_summary(risk_type_summary)})")
            # Still check and seed controls/risks if missing
            result = await db.execute(select(Control))
            if not result.scalars().first():
                await seed_controls_and_risks(db)
            elif risk_type_summary["created"] or risk_type_summary["repaired"]:
                await db.commit()
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

        risk_type_summary = await seed_default_risk_types(db)
        print(f"Reconciled default risk types ({_format_risk_type_seed_summary(risk_type_summary)})")

        # Create test users
        users = {}
        for user_data_raw in TEST_USERS:
            user_data = cast(SeedPayload, user_data_raw)
            role = roles[cast(str, user_data["role"])]
            department_code = cast(str | None, user_data["department"])
            user_department = departments.get(department_code) if department_code else None
            user = User(
                email=cast(str, user_data["email"]),
                name=cast(str, user_data["name"]),
                role_id=role.id,
                department_id=user_department.id if user_department else None,
                is_active=True,
                access_scope=AccessScope(cast(str, user_data.get("access_scope", AccessScope.DEPARTMENT))),
            )
            db.add(user)
            users[cast(str, user_data["email"])] = user
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
        control_payload = cast(SeedPayload, dict(ctrl_data))
        dept = departments.get(cast(str, control_payload.pop("department")))
        control = Control(
            **control_payload,
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
            exec_time = utc_now() - timedelta(days=days_ago)
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
        risk_payload = cast(SeedPayload, dict(risk_data))
        dept = departments.get(cast(str, risk_payload.pop("department")))
        gross_score = cast(int, risk_payload["gross_probability"]) * cast(int, risk_payload["gross_impact"])
        net_score = cast(int, risk_payload["net_probability"]) * cast(int, risk_payload["net_impact"])
        risk = Risk(
            **risk_payload,
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
