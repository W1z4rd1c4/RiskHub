"""
Activity Log regression tests.
"""
from datetime import datetime, UTC, timedelta

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import StatementError

from app.main import app
from app.api import deps
from app.core import security
from app.db.session import get_db
from app.core.activity_logger import (
    log_activity,
    MAX_DESCRIPTION_LENGTH,
    MAX_CHANGE_KEYS,
    MAX_CHANGE_VALUE_LENGTH,
)
from app.models import (
    ActivityLog,
    Permission,
    Role,
    RolePermission,
    User,
    Department,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.user import AccessScope


@pytest.mark.asyncio
async def test_activity_log_allows_null_actor_id(auth_client: AsyncClient, db_session):
    await log_activity(
        db_session,
        entity_type=ActivityEntityType.RISK,
        entity_id=1,
        entity_name="Test Risk",
        action=ActivityAction.CREATE,
        actor=None,
        department_id=None,
        changes=None,
        description="Anonymous entry",
    )
    await db_session.commit()

    response = await auth_client.get("/api/v1/activity-log")
    assert response.status_code == 200
    items = response.json()["items"]
    assert any(item["actor_id"] is None for item in items)


@pytest.mark.asyncio
async def test_risk_update_activity_log_changes(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
    seed_risk_types,
):
    create_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-AL-01",
            "name": "Activity Risk",
            "process": "Initial Process",
            "description": "Risk for activity log test",
            "department_id": test_department.id,
            "owner_id": test_user.id,
            "risk_type": "operational",
            "category": "Testing",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    risk_id = create_response.json()["id"]

    await auth_client.patch(
        f"/api/v1/risks/{risk_id}",
        json={
            "process": "Updated Process",
            "net_probability": 1,
            "net_impact": 1,
        },
    )

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.RISK.value,
            ActivityLog.entity_id == risk_id,
            ActivityLog.action == ActivityAction.UPDATE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    changes = entry.changes
    assert changes["process"]["old"] == "Initial Process"
    assert changes["process"]["new"] == "Updated Process"
    assert changes["net_probability"]["old"] == 2
    assert changes["net_probability"]["new"] == 1
    assert changes["net_score"]["old"] == 4
    assert changes["net_score"]["new"] == 1


@pytest.mark.asyncio
async def test_control_update_activity_log_changes(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Activity Control",
            "description": "Control for activity log test",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    control_id = create_response.json()["id"]

    await auth_client.patch(
        f"/api/v1/controls/{control_id}",
        json={
            "name": "Updated Control",
            "risk_level": 5,
        },
    )

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.CONTROL.value,
            ActivityLog.entity_id == control_id,
            ActivityLog.action == ActivityAction.UPDATE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    changes = entry.changes
    assert changes["name"]["old"] == "Activity Control"
    assert changes["name"]["new"] == "Updated Control"
    assert changes["risk_level"]["old"] == 3
    assert changes["risk_level"]["new"] == 5


@pytest.mark.asyncio
async def test_kri_update_activity_log_changes(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
    seed_risk_types,
):
    risk_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-AL-02",
            "name": "KRI Risk",
            "process": "KRI Process",
            "description": "Risk for KRI activity log test",
            "department_id": test_department.id,
            "owner_id": test_user.id,
            "risk_type": "operational",
            "category": "Testing",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    risk_id = risk_response.json()["id"]

    kri_response = await auth_client.post(
        "/api/v1/kris",
        json={
            "risk_id": risk_id,
            "metric_name": "Activity KRI",
            "description": "Initial description",
            "current_value": 10,
            "lower_limit": 5,
            "upper_limit": 20,
            "unit": "%",
            "frequency": "monthly",
        },
    )
    kri_id = kri_response.json()["id"]

    await auth_client.put(
        f"/api/v1/kris/{kri_id}",
        json={
            "description": "Updated description",
            "current_value": 12,
        },
    )

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.KRI.value,
            ActivityLog.entity_id == kri_id,
            ActivityLog.action == ActivityAction.UPDATE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    changes = entry.changes
    assert changes["description"]["old"] == "Initial description"
    assert changes["description"]["new"] == "Updated description"
    assert changes["current_value"]["old"] == 10
    assert changes["current_value"]["new"] == 12


@pytest.mark.asyncio
async def test_approval_activity_log_create_and_approve(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
    seed_risk_types,
):
    risk_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-AL-03",
            "name": "Approval Risk",
            "process": "Approval Process",
            "description": "Risk for approval log test",
            "department_id": test_department.id,
            "owner_id": test_user.id,
            "risk_type": "operational",
            "category": "Testing",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    risk_id = risk_response.json()["id"]

    approval_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": risk_id,
            "reason": "Cleanup",
        },
    )
    approval_id = approval_response.json()["id"]

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.APPROVAL.value,
            ActivityLog.entity_id == approval_id,
            ActivityLog.action == ActivityAction.CREATE.value,
        )
    )
    assert result.scalars().first() is not None

    await auth_client.post(
        f"/api/v1/approvals/{approval_id}/approve",
        json={"resolution_notes": "Approved"},
    )

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.APPROVAL.value,
            ActivityLog.entity_id == approval_id,
            ActivityLog.action == ActivityAction.APPROVE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.changes["status"]["old"] == "pending"
    assert entry.changes["status"]["new"] == "approved"


@pytest.mark.asyncio
async def test_approval_activity_log_reject(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
    seed_risk_types,
):
    risk_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-AL-04",
            "name": "Reject Risk",
            "process": "Reject Process",
            "description": "Risk for reject log test",
            "department_id": test_department.id,
            "owner_id": test_user.id,
            "risk_type": "operational",
            "category": "Testing",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
        },
    )
    risk_id = risk_response.json()["id"]

    approval_response = await auth_client.post(
        "/api/v1/approvals",
        json={
            "resource_type": "risk",
            "resource_id": risk_id,
            "reason": "Reject test",
        },
    )
    approval_id = approval_response.json()["id"]

    await auth_client.post(
        f"/api/v1/approvals/{approval_id}/reject",
        json={"resolution_notes": "Rejected"},
    )

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.APPROVAL.value,
            ActivityLog.entity_id == approval_id,
            ActivityLog.action == ActivityAction.REJECT.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.changes["status"]["old"] == "pending"
    assert entry.changes["status"]["new"] == "rejected"


@pytest.mark.asyncio
async def test_user_create_update_activity_log(
    auth_client: AsyncClient,
    db_session,
    test_department: Department,
    test_role: Role,
):
    create_response = await auth_client.post(
        "/api/v1/users",
        json={
            "email": "activity-user@test.com",
            "name": "Activity User",
            "password": "StrongPass123!",
            "role_id": test_role.id,
            "department_id": test_department.id,
            "is_active": True,
        },
    )
    user_id = create_response.json()["id"]

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.USER.value,
            ActivityLog.entity_id == user_id,
            ActivityLog.action == ActivityAction.CREATE.value,
        )
    )
    assert result.scalars().first() is not None

    await auth_client.patch(
        f"/api/v1/users/{user_id}",
        json={
            "is_active": False,
            "password": "NewStrongPass456!",
        },
    )

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.USER.value,
            ActivityLog.entity_id == user_id,
            ActivityLog.action == ActivityAction.UPDATE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    changes = entry.changes
    assert changes["is_active"]["old"] is True
    assert changes["is_active"]["new"] is False
    assert changes["password_changed"]["new"] is True
    assert "password" not in changes
    assert "hashed_password" not in changes


@pytest.mark.asyncio
async def test_activity_log_search_in_changes_and_default_window(
    auth_client: AsyncClient,
    db_session,
):
    await log_activity(
        db_session,
        entity_type=ActivityEntityType.RISK,
        entity_id=10,
        entity_name="Recent Entry",
        action=ActivityAction.UPDATE,
        actor=None,
        department_id=None,
        changes={"field": {"old": "alpha", "new": "search-needle"}},
        description="Recent entry",
    )
    old_entry = ActivityLog(
        entity_type=ActivityEntityType.RISK.value,
        entity_id=11,
        entity_name="Old Entry",
        action=ActivityAction.UPDATE.value,
        actor_id=None,
        actor_name="Anonymous",
        department_id=None,
        changes={"field": {"old": "beta", "new": "ancient-needle"}},
        description="Old entry",
        created_at=datetime.now(UTC) - timedelta(days=120),
    )
    db_session.add(old_entry)
    await db_session.commit()

    response = await auth_client.get("/api/v1/activity-log", params={"search": "search-needle"})
    assert response.status_code == 200
    assert any(item["entity_name"] == "Recent Entry" for item in response.json()["items"])

    response = await auth_client.get("/api/v1/activity-log", params={"search": "ancient-needle"})
    assert response.status_code == 200
    assert all(item["entity_name"] != "Old Entry" for item in response.json()["items"])

    response = await auth_client.get(
        "/api/v1/activity-log",
        params={
            "search": "ancient-needle",
            "date_from": (datetime.now(UTC) - timedelta(days=200)).isoformat(),
        },
    )
    assert response.status_code == 200
    assert any(item["entity_name"] == "Old Entry" for item in response.json()["items"])


@pytest.mark.asyncio
async def test_activity_log_guardrails(db_session):
    long_description = "d" * (MAX_DESCRIPTION_LENGTH + 50)
    oversized_changes = {
        f"field_{i}": {
            "old": "x" * (MAX_CHANGE_VALUE_LENGTH + 20),
            "new": "y" * (MAX_CHANGE_VALUE_LENGTH + 20),
        }
        for i in range(MAX_CHANGE_KEYS + 10)
    }

    await log_activity(
        db_session,
        entity_type=ActivityEntityType.RISK,
        entity_id=20,
        entity_name="Guardrail Entry",
        action=ActivityAction.UPDATE,
        actor=None,
        department_id=None,
        changes=oversized_changes,
        description=long_description,
    )
    await db_session.commit()

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.RISK.value,
            ActivityLog.entity_id == 20,
            ActivityLog.action == ActivityAction.UPDATE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert len(entry.description) <= MAX_DESCRIPTION_LENGTH
    assert len(entry.changes) == MAX_CHANGE_KEYS
    sample_value = next(iter(entry.changes.values()))
    assert len(sample_value["old"]) <= MAX_CHANGE_VALUE_LENGTH
    assert len(sample_value["new"]) <= MAX_CHANGE_VALUE_LENGTH


@pytest.mark.asyncio
async def test_activity_log_rejects_invalid_enum(db_session):
    bad_action = ActivityLog(
        entity_type=ActivityEntityType.RISK.value,
        entity_id=1,
        entity_name="Bad Action",
        action="invalid",
        actor_id=None,
        actor_name="Anonymous",
        department_id=None,
        changes=None,
        description="Bad action",
    )
    db_session.add(bad_action)
    with pytest.raises((StatementError, ValueError, LookupError)):
        await db_session.flush()
    await db_session.rollback()

    bad_entity = ActivityLog(
        entity_type="invalid",
        entity_id=1,
        entity_name="Bad Entity",
        action=ActivityAction.CREATE.value,
        actor_id=None,
        actor_name="Anonymous",
        department_id=None,
        changes=None,
        description="Bad entity",
    )
    db_session.add(bad_entity)
    with pytest.raises((StatementError, ValueError, LookupError)):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_activity_log_is_append_only(db_session):
    await log_activity(
        db_session,
        entity_type=ActivityEntityType.RISK,
        entity_id=30,
        entity_name="Immutable Entry",
        action=ActivityAction.CREATE,
        actor=None,
        department_id=None,
        changes=None,
        description="Immutable",
    )
    await db_session.commit()

    result = await db_session.execute(
        select(ActivityLog).where(ActivityLog.entity_id == 30)
    )
    entry = result.scalars().first()
    assert entry is not None

    entry.description = "Updated"
    with pytest.raises(ValueError):
        await db_session.commit()
    await db_session.rollback()

    await db_session.delete(entry)
    with pytest.raises(ValueError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_activity_log_department_scoping(db_session):
    dept_a = Department(name="Dept A", code="A", description="Dept A")
    dept_b = Department(name="Dept B", code="B", description="Dept B")
    db_session.add_all([dept_a, dept_b])
    await db_session.commit()
    await db_session.refresh(dept_a)
    await db_session.refresh(dept_b)

    role = Role(name="dept_head", display_name="Dept Head", description="Dept Head")
    db_session.add(role)
    await db_session.commit()
    perm = Permission(resource="activity_log", action="read", description="Read activity log")
    db_session.add(perm)
    await db_session.commit()
    db_session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await db_session.commit()

    scoped_user = User(
        name="Dept User",
        email="dept-user@test.com",
        department_id=dept_a.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(scoped_user)
    await db_session.commit()
    result = await db_session.execute(
        select(User)
        .options(
            selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            selectinload(User.department),
        )
        .where(User.id == scoped_user.id)
    )
    scoped_user = result.scalar_one()

    await log_activity(
        db_session,
        entity_type=ActivityEntityType.RISK,
        entity_id=100,
        entity_name="Dept A Entry",
        action=ActivityAction.CREATE,
        actor=None,
        department_id=dept_a.id,
        changes=None,
        description="Dept A",
    )
    await log_activity(
        db_session,
        entity_type=ActivityEntityType.RISK,
        entity_id=101,
        entity_name="Dept B Entry",
        action=ActivityAction.CREATE,
        actor=None,
        department_id=dept_b.id,
        changes=None,
        description="Dept B",
    )
    await db_session.commit()

    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        return scoped_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[deps.get_current_user] = override_get_current_user
    app.dependency_overrides[security.get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as scoped_client:
            response = await scoped_client.get("/api/v1/activity-log")
            assert response.status_code == 200
            items = response.json()["items"]
            assert any(item["entity_name"] == "Dept A Entry" for item in items)
            assert all(item["entity_name"] != "Dept B Entry" for item in items)
    finally:
        app.dependency_overrides.clear()
