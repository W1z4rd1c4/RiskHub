import pytest

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Permission, Role, RolePermission, User, Vendor
from app.models.notification import Notification, NotificationType
from app.models.user import AccessScope


async def _grant(db_session: AsyncSession, role: Role, resource: str, action: str) -> None:
    perm = Permission(resource=resource, action=action, description=f"{resource}:{action}")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])


@pytest.mark.asyncio
async def test_vendor_sla_breach_creates_notification(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    # governance recipients
    rm_role = Role(name="risk_manager", display_name="Risk Manager", description="RM")
    compliance_role = Role(name="compliance", display_name="Compliance", description="Compliance")
    db_session.add_all([rm_role, compliance_role])
    await db_session.commit()
    await _grant(db_session, rm_role, "vendors", "read")
    await _grant(db_session, compliance_role, "vendors", "read")
    rm_user = User(
        name="RM",
        email="rm3@test.com",
        department_id=test_department.id,
        role_id=rm_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    compliance_user = User(
        name="Compliance",
        email="compliance3@test.com",
        department_id=test_department.id,
        role_id=compliance_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    other_department = Department(name="Other Dept (SLA notif)", code="SLA2", description="Other dept")
    db_session.add(other_department)
    await db_session.commit()
    await db_session.refresh(other_department)
    rm_other_dept = User(
        name="RM Other Dept",
        email="rm_other_dept_sla@test.com",
        department_id=other_department.id,
        role_id=rm_role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add_all([rm_user, compliance_user])
    db_session.add(rm_other_dept)
    await db_session.commit()

    vendor = Vendor(
        name="SLA Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    # Create SLA as reporting owner (employee)
    resp = await client_employee.post(
        "/api/v1/vendor-slas",
        json={
            "vendor_id": vendor.id,
            "metric_name": "Availability",
            "description": "Monthly availability %",
            "current_value": 99.0,
            "lower_limit": 98.0,
            "upper_limit": 100.0,
            "unit": "%",
            "frequency": "monthly",
            "reporting_owner_id": test_user_employee.id,
        },
    )
    assert resp.status_code == 201
    sla_id = resp.json()["id"]

    # Record breached value
    resp = await client_employee.post(f"/api/v1/vendor-slas/{sla_id}/values", json={"value": 90.0})
    assert resp.status_code == 200
    assert resp.json()["breach_status"] in ("below", "above")

    notifications = (await db_session.execute(select(Notification))).scalars().all()
    assert any(n.type == NotificationType.VENDOR_SLA_BREACH_DETECTED for n in notifications)
    assert not any(
        n.type == NotificationType.VENDOR_SLA_BREACH_DETECTED and n.user_id == rm_other_dept.id for n in notifications
    )


@pytest.mark.asyncio
async def test_vendor_owner_can_create_sla_without_vendor_write_permission(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    vendor = Vendor(
        name="Owner SLA Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    resp = await client_employee.post(
        "/api/v1/vendor-slas",
        json={
            "vendor_id": vendor.id,
            "metric_name": "Availability",
            "description": "Monthly availability %",
            "current_value": 99.0,
            "lower_limit": 98.0,
            "upper_limit": 100.0,
            "unit": "%",
            "frequency": "monthly",
            "reporting_owner_id": None,
        },
    )
    assert resp.status_code == 201
