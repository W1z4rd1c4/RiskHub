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
async def test_vendor_assessment_workflow_transitions_and_notifications(
    db_session: AsyncSession,
    client_employee: AsyncClient,
    client_risk_manager: AsyncClient,
    client_cro: AsyncClient,
    test_department: Department,
    test_role_employee: Role,
    test_role_risk_manager: Role,
    test_user_employee: User,
    test_user_risk_manager: User,
    test_user_cro: User,
):
    # Permissions for reading vendor context
    await _grant(db_session, test_role_employee, "vendors", "read")
    await _grant(db_session, test_role_risk_manager, "vendors", "read")

    # Compliance user (also notified + can committee-recommend)
    compliance_role = Role(name="compliance", display_name="Compliance", description="Compliance role")
    db_session.add(compliance_role)
    await db_session.commit()
    await _grant(db_session, compliance_role, "vendors", "read")

    compliance_user = User(
        name="Test Compliance",
        email="compliance@test.com",
        department_id=test_department.id,
        role_id=compliance_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(compliance_user)
    await db_session.commit()
    await db_session.refresh(compliance_user)

    vendor = Vendor(
        name="Acme ICT",
        process="IT",
        subprocess=None,
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user_employee.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=True,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    # Create draft (owner)
    resp = await client_employee.post(f"/api/v1/vendors/{vendor.id}/assessments", json={})
    assert resp.status_code == 201
    assessment = resp.json()
    assert assessment["vendor_id"] == vendor.id
    assert assessment["status"] == "draft"
    assert assessment["scope"] == "dora"

    assessment_id = assessment["id"]

    # Update draft (owner)
    resp = await client_employee.patch(
        f"/api/v1/vendor-assessments/{assessment_id}/draft",
        json={"answers_json": {"q1": True}, "evidence_reference": "https://example.com/evidence"},
    )
    assert resp.status_code == 200
    assert resp.json()["answers_json"]["q1"] is True

    # Submit (owner)
    resp = await client_employee.post(f"/api/v1/vendor-assessments/{assessment_id}/submit")
    assert resp.status_code == 200
    assert resp.json()["status"] == "submitted"

    # Edits after submit are blocked
    resp = await client_employee.patch(
        f"/api/v1/vendor-assessments/{assessment_id}/draft",
        json={"answers_json": {"q1": False}},
    )
    assert resp.status_code == 400

    # Review requires risk_manager/compliance role
    resp = await client_employee.post(f"/api/v1/vendor-assessments/{assessment_id}/review")
    assert resp.status_code == 403

    resp = await client_risk_manager.post(f"/api/v1/vendor-assessments/{assessment_id}/review")
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_review"

    # Committee recommend as compliance
    headers = {"X-Mock-User-Id": str(compliance_user.id)}
    resp = await client_employee.post(
        f"/api/v1/vendor-assessments/{assessment_id}/committee-recommend",
        headers=headers,
        json={"committee_recommendation": "approve", "conditions_text": "OK"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "committee_recommended"

    # Decision requires CRO role
    resp = await client_employee.post(
        f"/api/v1/vendor-assessments/{assessment_id}/decide",
        json={"decision": "approved"},
    )
    assert resp.status_code == 403

    resp = await client_cro.post(
        f"/api/v1/vendor-assessments/{assessment_id}/decide",
        json={"decision": "approved"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"

    # Notifications created for workflow milestones
    result = await db_session.execute(select(Notification).order_by(Notification.id))
    notifications = result.scalars().all()

    assert any(n.type == NotificationType.VENDOR_ASSESSMENT_SUBMITTED and n.user_id == test_user_risk_manager.id for n in notifications)
    assert any(n.type == NotificationType.VENDOR_ASSESSMENT_SUBMITTED and n.user_id == compliance_user.id for n in notifications)
    assert any(n.type == NotificationType.VENDOR_ASSESSMENT_SUBMITTED and n.user_id == test_user_cro.id for n in notifications)
    assert any(n.type == NotificationType.VENDOR_ASSESSMENT_COMMITTEE_RECOMMENDED and n.user_id == test_user_cro.id for n in notifications)
    assert any(n.type == NotificationType.VENDOR_ASSESSMENT_DECIDED and n.user_id == test_user_employee.id for n in notifications)

