import pytest

from datetime import datetime, UTC

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
async def test_major_vendor_incident_triggers_reassessment_and_notification(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_employee, "vendors", "read")

    # Add governance recipients
    rm_role = Role(name="risk_manager", display_name="Risk Manager", description="RM")
    compliance_role = Role(name="compliance", display_name="Compliance", description="Compliance")
    db_session.add_all([rm_role, compliance_role])
    await db_session.commit()

    rm_user = User(
        name="RM",
        email="rm2@test.com",
        department_id=test_department.id,
        role_id=rm_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    compliance_user = User(
        name="Compliance",
        email="compliance2@test.com",
        department_id=test_department.id,
        role_id=compliance_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add_all([rm_user, compliance_user])
    await db_session.commit()

    vendor = Vendor(
        name="Test Vendor",
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
        f"/api/v1/vendors/{vendor.id}/incidents",
        json={
            "incident_type": "security",
            "severity": "critical",
            "is_major": True,
            "summary": "Major breach",
            "details": "Details",
            "occurred_at": datetime.now(UTC).isoformat(),
        },
    )
    assert resp.status_code == 201

    # Vendor reassessment trigger updated
    v = (await db_session.execute(select(Vendor).where(Vendor.id == vendor.id))).scalar_one()
    assert v.reassessment_triggered_reason == "major_incident"
    assert v.next_reassessment_due_at is not None

    notifications = (await db_session.execute(select(Notification))).scalars().all()
    assert any(n.type == NotificationType.VENDOR_REASSESSMENT_DUE_SOON and n.user_id == test_user_employee.id for n in notifications)

