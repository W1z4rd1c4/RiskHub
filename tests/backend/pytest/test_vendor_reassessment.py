from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Permission, Role, RolePermission, User, Vendor
from app.models.notification import Notification, NotificationType
from app.models.user import AccessScope
from app.services.vendor_reassessment_service import VendorReassessmentService


async def _grant(db_session: AsyncSession, role: Role, resource: str, action: str) -> None:
    perm = Permission(resource=resource, action=action, description=f"{resource}:{action}")
    db_session.add(perm)
    await db_session.commit()
    await db_session.refresh(perm)

    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()
    db_session.expire(role, ["permissions"])


@pytest.mark.asyncio
async def test_vendor_create_sets_default_reassessment_fields(
    db_session: AsyncSession,
    client_department_head: AsyncClient,
    test_department: Department,
    test_role_department_head: Role,
    test_user_employee: User,
):
    await _grant(db_session, test_role_department_head, "vendors", "write")

    resp = await client_department_head.post(
        "/api/v1/vendors",
        json={
            "name": "Critical Vendor",
            "process": "IT",
            "department_id": test_department.id,
            "outsourcing_owner_user_id": test_user_employee.id,
            "vendor_type": "ict",
            "risk_score_1_5": 3,
            "supports_important_core_insurance_function": True,
            "dora_relevant": False,
            "is_significant_vendor": False,
            "has_alternative_providers": False,
            "status": "active",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["reassessment_cadence_months"] == 12
    assert data["next_reassessment_due_at"] is not None

    resp = await client_department_head.post(
        "/api/v1/vendors",
        json={
            "name": "Noncritical Vendor",
            "process": "IT",
            "department_id": test_department.id,
            "outsourcing_owner_user_id": test_user_employee.id,
            "vendor_type": "ict",
            "risk_score_1_5": 3,
            "supports_important_core_insurance_function": False,
            "dora_relevant": False,
            "is_significant_vendor": False,
            "has_alternative_providers": False,
            "status": "active",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["reassessment_cadence_months"] == 36
    assert data["next_reassessment_due_at"] is not None


@pytest.mark.asyncio
async def test_vendor_reassessment_due_soon_and_overdue_notifications_are_deduped(
    db_session: AsyncSession,
    test_department: Department,
):
    owner_role = Role(name="employee", display_name="Employee", description="Owner role")
    db_session.add(owner_role)
    await db_session.commit()
    await _grant(db_session, owner_role, "vendors", "read")

    owner = User(
        name="Owner",
        email="owner@test.com",
        department_id=test_department.id,
        role_id=owner_role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(owner)
    await db_session.commit()
    await db_session.refresh(owner)

    now = datetime.now(UTC)

    due_soon_vendor = Vendor(
        name="Due Soon Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=owner.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
        reassessment_cadence_months=36,
        next_reassessment_due_at=now + timedelta(days=10),
    )

    overdue_vendor = Vendor(
        name="Overdue Vendor",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=owner.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=False,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
        reassessment_cadence_months=36,
        next_reassessment_due_at=now - timedelta(days=5),
    )

    db_session.add_all([due_soon_vendor, overdue_vendor])
    await db_session.commit()

    result1 = await VendorReassessmentService.check_vendor_reassessments(db_session, now=now)
    assert result1["due_soon"] == 1
    assert result1["overdue"] == 1

    # Same run again shouldn't create duplicates
    result2 = await VendorReassessmentService.check_vendor_reassessments(db_session, now=now)
    assert result2["due_soon"] == 0
    assert result2["overdue"] == 0

    notifications = (await db_session.execute(select(Notification))).scalars().all()
    assert sum(1 for n in notifications if n.type == NotificationType.VENDOR_REASSESSMENT_DUE_SOON) == 1
    assert sum(1 for n in notifications if n.type == NotificationType.VENDOR_REASSESSMENT_OVERDUE) == 1
