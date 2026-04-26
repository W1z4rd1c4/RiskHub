"""
Activity Log regression tests.
"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import StatementError
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core import security
from app.core.activity_logger import (
    MAX_CHANGE_KEYS,
    MAX_CHANGE_VALUE_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    audit_logger,
    log_activity,
)
from app.db.session import get_db
from app.main import app
from app.models import (
    ActivityLog,
    ApprovalScenario,
    Department,
    Permission,
    Role,
    RolePermission,
    User,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.user import AccessScope


@pytest.mark.asyncio
async def test_activity_log_allows_null_actor_id(client_cro: AsyncClient, db_session):
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

    response = await client_cro.get("/api/v1/activity-log")
    assert response.status_code == 200
    items = response.json()["items"]
    assert any(item["actor_id"] is None for item in items)


@pytest.mark.asyncio
async def test_activity_log_returns_backend_capabilities(client_cro: AsyncClient, db_session):
    await log_activity(
        db_session,
        entity_type=ActivityEntityType.RISK,
        entity_id=10,
        entity_name="Capability Risk",
        action=ActivityAction.CREATE,
        actor=None,
        department_id=None,
        changes=None,
        description="Capability entry",
    )
    await db_session.commit()

    response = await client_cro.get("/api/v1/activity-log")

    assert response.status_code == 200
    capabilities = response.json()["capabilities"]
    assert capabilities["can_read"] is True
    assert capabilities["can_filter_by_department"] is True
    assert capabilities["can_view_entity_filters"] is True
    assert capabilities["can_export_csv"] is True


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
    assert changes["name"]["old"] == "[REDACTED]"
    assert changes["name"]["new"] == "[REDACTED]"
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
    assert changes["description"]["old"] == "[REDACTED]"
    assert changes["description"]["new"] == "[REDACTED]"


@pytest.mark.asyncio
async def test_approval_activity_log_create_and_approve(
    client_approval_requester: AsyncClient,
    client_risk_manager: AsyncClient,
    db_session,
    test_user_approval_requester: User,
    test_department: Department,
    seed_risk_types,
):
    risk_response = await client_approval_requester.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-AL-03",
            "name": "Approval Risk",
            "process": "Approval Process",
            "description": "Risk for approval log test",
            "department_id": test_department.id,
            "owner_id": test_user_approval_requester.id,
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

    approval_response = await client_approval_requester.post(
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

    approve_response = await client_risk_manager.post(
        f"/api/v1/approvals/{approval_id}/approve",
        json={"resolution_notes": "Approved"},
    )
    assert approve_response.status_code == 200

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.APPROVAL.value,
            ActivityLog.entity_id == approval_id,
            ActivityLog.action == ActivityAction.APPROVE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.changes["status"]["old"].upper() == "PENDING"
    assert entry.changes["status"]["new"].upper() == "APPROVED"

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.RISK.value,
            ActivityLog.entity_id == risk_id,
            ActivityLog.action == ActivityAction.ARCHIVE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.entity_name == "R-AL-03"
    assert entry.description == "Archived Risk"


@pytest.mark.asyncio
async def test_risk_restore_activity_log_keeps_safe_restore_description(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
    seed_risk_types,
):
    create_response = await auth_client.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "R-REST-01",
            "name": "Sensitive Restore Risk",
            "process": "Restore Process",
            "description": "Risk used to validate restore logging",
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
    assert create_response.status_code == 201
    risk_id = create_response.json()["id"]

    archive_response = await auth_client.delete(f"/api/v1/risks/{risk_id}?reason=Archive+for+restore+logging")
    assert archive_response.status_code == 204

    restore_response = await auth_client.post(f"/api/v1/risks/{risk_id}/restore")
    assert restore_response.status_code == 200

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.RISK.value,
            ActivityLog.entity_id == risk_id,
            ActivityLog.action == ActivityAction.UPDATE.value,
            ActivityLog.description == "Restored risk",
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.entity_name == "R-REST-01"
    assert entry.changes["status"]["old"] == "archived"
    assert entry.changes["status"]["new"] == "active"


@pytest.mark.asyncio
async def test_control_restore_activity_log_uses_generic_safe_description(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    create_response = await auth_client.post(
        "/api/v1/controls",
        json={
            "name": "Sensitive Restore Control",
            "description": "Control used to validate restore logging",
            "department_id": test_department.id,
            "control_owner_id": test_user.id,
            "control_form": "manual",
            "frequency": "monthly",
            "risk_level": 3,
            "status": "active",
        },
    )
    assert create_response.status_code == 201
    control_id = create_response.json()["id"]

    archive_response = await auth_client.delete(f"/api/v1/controls/{control_id}?reason=Archive+for+restore+logging")
    assert archive_response.status_code == 204

    restore_response = await auth_client.post(f"/api/v1/controls/{control_id}/restore")
    assert restore_response.status_code == 200

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.CONTROL.value,
            ActivityLog.entity_id == control_id,
            ActivityLog.action == ActivityAction.UPDATE.value,
            ActivityLog.description == "Restored Control",
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.entity_name == "Control"
    assert entry.changes["status"]["old"] == "archived"
    assert entry.changes["status"]["new"] == "active"


@pytest.mark.asyncio
async def test_approval_execution_logs_entity_update_for_priority_risk_edit(
    client: AsyncClient,
    db_session,
    test_department: Department,
    test_user_approval_requester: User,
    test_user_cro: User,
    seed_risk_types,
):
    risk_response = await client.post(
        "/api/v1/risks",
        headers={"X-Mock-User-Id": str(test_user_cro.id)},
        json={
            "risk_id_code": "R-AL-05",
            "name": "Priority Risk",
            "process": "Approval Process",
            "description": "Risk for approval execution log test",
            "department_id": test_department.id,
            "owner_id": test_user_cro.id,
            "risk_type": "operational",
            "category": "Testing",
            "gross_probability": 3,
            "gross_impact": 3,
            "net_probability": 2,
            "net_impact": 2,
            "status": "active",
            "is_priority": True,
        },
    )
    assert risk_response.status_code == 201, risk_response.text
    risk_id = risk_response.json()["id"]

    update_response = await client.patch(
        f"/api/v1/risks/{risk_id}",
        headers={"X-Mock-User-Id": str(test_user_approval_requester.id)},
        json={"description": "Updated by employee (requires approval)"},
    )
    assert update_response.status_code == 202, update_response.text
    approval_id = update_response.json()["approval_id"]

    approve_response = await client.post(
        f"/api/v1/approvals/{approval_id}/approve",
        headers={"X-Mock-User-Id": str(test_user_cro.id)},
        json={"resolution_notes": "Approved"},
    )
    assert approve_response.status_code == 200, approve_response.text

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.RISK.value,
            ActivityLog.entity_id == risk_id,
            ActivityLog.action == ActivityAction.UPDATE.value,
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.changes["description"]["new"] == "[REDACTED]"
    assert entry.entity_name == "R-AL-05"
    assert entry.description == "Updated Risk (updated sensitive fields)"


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
    assert entry.changes["status"]["old"].upper() == "PENDING"
    assert entry.changes["status"]["new"].upper() == "REJECTED"


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
    client_cro: AsyncClient,
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
        changes={"process": {"old": "alpha", "new": "search-needle"}},
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
        changes={"process": {"old": "beta", "new": "ancient-needle"}},
        description="Old entry",
        created_at=datetime.now(UTC) - timedelta(days=120),
    )
    db_session.add(old_entry)
    await db_session.commit()

    response = await client_cro.get("/api/v1/activity-log", params={"search": "search-needle"})
    assert response.status_code == 200
    assert any(item["entity_id"] == 10 for item in response.json()["items"])

    response = await client_cro.get("/api/v1/activity-log", params={"search": "ancient-needle"})
    assert response.status_code == 200
    assert all(item["entity_id"] != 11 for item in response.json()["items"])

    response = await client_cro.get(
        "/api/v1/activity-log",
        params={
            "search": "ancient-needle",
            "date_from": (datetime.now(UTC) - timedelta(days=200)).isoformat(),
        },
    )
    assert response.status_code == 200
    assert any(item["entity_id"] == 11 for item in response.json()["items"])


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
async def test_activity_log_redacts_sensitive_and_unknown_fields_and_keeps_safe_fields(
    db_session,
):
    await log_activity(
        db_session,
        entity_type=ActivityEntityType.USER,
        entity_id=40,
        entity_name="Audit User",
        action=ActivityAction.UPDATE,
        actor=None,
        department_id=None,
        changes={
            "password": {"old": None, "new": "super-secret"},
            "email": {"old": "old@example.com", "new": "new@example.com"},
            "description": {"old": "private", "new": "still private"},
            "session_id": {"old": "session-old", "new": "session-new"},
            "result_json": {"old": {"detail": "old"}, "new": {"detail": "new"}},
            "mystery_field": {"old": "alpha", "new": "beta"},
            "is_active": {"old": True, "new": False},
            "password_changed": {"old": None, "new": True},
        },
        description=None,
    )
    await db_session.commit()

    result = await db_session.execute(select(ActivityLog).where(ActivityLog.entity_id == 40))
    entry = result.scalars().first()
    assert entry is not None
    assert entry.changes["password"]["new"] == "[REDACTED]"
    assert entry.changes["email"]["old"] == "[REDACTED]"
    assert entry.changes["description"]["new"] == "[REDACTED]"
    assert entry.changes["session_id"]["new"] == "[REDACTED]"
    assert entry.changes["result_json"]["new"] == "[REDACTED]"
    assert entry.changes["mystery_field"]["new"] == "[REDACTED]"
    assert entry.changes["is_active"]["new"] is False
    assert entry.changes["password_changed"]["new"] is True
    assert "password" not in entry.description.lower()
    assert "description" not in entry.description.lower()
    assert "session" not in entry.description.lower()
    assert "result_json" not in entry.description.lower()
    assert "mystery_field" not in entry.description.lower()


@pytest.mark.asyncio
async def test_activity_log_templates_issue_metadata_and_hides_raw_titles_from_search(
    client_cro: AsyncClient,
    db_session,
    test_user: User,
):
    await log_activity(
        db_session,
        entity_type=ActivityEntityType.ISSUE,
        entity_id=52,
        entity_name="ULTRA-SENSITIVE-ISSUE-TITLE",
        action=ActivityAction.CREATE,
        actor=test_user,
        department_id=test_user.department_id,
        description="Created issue: ULTRA-SENSITIVE-ISSUE-TITLE",
    )
    await db_session.commit()

    result = await db_session.execute(select(ActivityLog).where(ActivityLog.entity_id == 52))
    entry = result.scalars().first()
    assert entry is not None
    assert entry.entity_name == "Issue"
    assert entry.actor_name == test_user.name
    assert entry.description == "Created Issue"

    raw_search = await client_cro.get("/api/v1/activity-log?search=ULTRA-SENSITIVE-ISSUE-TITLE")
    assert raw_search.status_code == 200
    assert raw_search.json()["total"] == 0

    actor_search = await client_cro.get(f"/api/v1/activity-log?search={test_user.name}")
    assert actor_search.status_code == 200
    assert any(item["entity_id"] == 52 for item in actor_search.json()["items"])


@pytest.mark.asyncio
async def test_activity_log_search_matches_safe_risk_labels_not_raw_names(
    client_cro: AsyncClient,
    db_session,
    test_user: User,
):
    await log_activity(
        db_session,
        entity_type=ActivityEntityType.RISK,
        entity_id=53,
        entity_name="ULTRA-SENSITIVE-RISK-NAME",
        safe_entity_label="R-AUD-053",
        action=ActivityAction.UPDATE,
        actor=test_user,
        department_id=test_user.department_id,
        changes={"risk_id_code": {"old": "R-AUD-052", "new": "R-AUD-053"}},
        description="Sensitive risk rename",
    )
    await db_session.commit()

    result = await db_session.execute(select(ActivityLog).where(ActivityLog.entity_id == 53))
    entry = result.scalars().first()
    assert entry is not None
    assert entry.entity_name == "R-AUD-053"
    assert entry.description == "Updated Risk (fields: risk_id_code)"

    safe_search = await client_cro.get("/api/v1/activity-log?search=R-AUD-053")
    assert safe_search.status_code == 200
    assert any(item["entity_id"] == 53 for item in safe_search.json()["items"])

    raw_search = await client_cro.get("/api/v1/activity-log?search=ULTRA-SENSITIVE-RISK-NAME")
    assert raw_search.status_code == 200
    assert raw_search.json()["total"] == 0


@pytest.mark.asyncio
async def test_vendor_legal_name_activity_log_changes_are_redacted_everywhere(
    client_cro: AsyncClient,
    db_session,
    test_user: User,
    monkeypatch,
):
    emitted: dict[str, object] = {}

    def capture(event: str, **kwargs: object) -> None:
        emitted["event"] = event
        emitted.update(kwargs)

    monkeypatch.setattr(audit_logger, "info", capture)

    await log_activity(
        db_session,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=54,
        entity_name="Vendor Profile",
        action=ActivityAction.UPDATE,
        actor=test_user,
        department_id=test_user.department_id,
        changes={
            "legal_name": {
                "old": "Secret Vendor LLC",
                "new": "Renamed Secret Vendor LLC",
            }
        },
        description="Updated vendor legal name",
    )
    await db_session.commit()

    result = await db_session.execute(select(ActivityLog).where(ActivityLog.entity_id == 54))
    entry = result.scalars().first()
    assert entry is not None
    assert entry.changes == {"legal_name": {"old": "[REDACTED]", "new": "[REDACTED]"}}
    assert entry.description == "Updated Vendor (updated sensitive fields)"
    assert emitted["changes"] == entry.changes

    raw_search = await client_cro.get("/api/v1/activity-log?search=Secret Vendor LLC")
    assert raw_search.status_code == 200
    assert raw_search.json()["total"] == 0


@pytest.mark.asyncio
async def test_risk_type_activity_log_uses_safe_label_structured_changes_and_restore_description(
    client_cro: AsyncClient,
    db_session,
):
    create_response = await client_cro.post(
        "/api/v1/riskhub/risk-types",
        json={
            "code": "activity_config_type",
            "display_name": "Activity Config Type",
            "description": "Config used for activity-log coverage",
            "color": "#64748b",
            "icon": "shield",
            "sort_order": 1,
        },
    )
    assert create_response.status_code == 201
    risk_type_id = create_response.json()["id"]

    update_response = await client_cro.patch(
        f"/api/v1/riskhub/risk-types/{risk_type_id}",
        json={
            "display_name": "Activity Config Type Updated",
            "color": "#0f172a",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["capabilities"] == {
        "can_create": True,
        "can_update": True,
        "can_delete": True,
        "can_restore": False,
    }

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.CONFIG.value,
            ActivityLog.entity_id == risk_type_id,
            ActivityLog.action == ActivityAction.UPDATE.value,
            ActivityLog.description == "Updated Config (fields: display_name, color)",
        )
    )
    update_entry = result.scalars().first()
    assert update_entry is not None
    assert update_entry.entity_name == "Activity Config Type Updated"
    assert update_entry.changes["display_name"]["old"] == "Activity Config Type"
    assert update_entry.changes["display_name"]["new"] == "Activity Config Type Updated"
    assert update_entry.changes["color"]["old"] == "#64748b"
    assert update_entry.changes["color"]["new"] == "#0f172a"

    search_response = await client_cro.get(
        "/api/v1/activity-log",
        params={"search": "Activity Config Type Updated"},
    )
    assert search_response.status_code == 200
    assert any(item["entity_id"] == risk_type_id for item in search_response.json()["items"])

    delete_response = await client_cro.delete(f"/api/v1/riskhub/risk-types/{risk_type_id}")
    assert delete_response.status_code == 200

    restore_response = await client_cro.post(f"/api/v1/riskhub/risk-types/{risk_type_id}/restore")
    assert restore_response.status_code == 200

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.CONFIG.value,
            ActivityLog.entity_id == risk_type_id,
            ActivityLog.action == ActivityAction.UPDATE.value,
            ActivityLog.description == "Restored risk type",
        )
    )
    restore_entry = result.scalars().first()
    assert restore_entry is not None
    assert restore_entry.entity_name == "Activity Config Type Updated"
    assert restore_entry.changes["is_active"]["old"] is False
    assert restore_entry.changes["is_active"]["new"] is True


@pytest.mark.asyncio
async def test_approval_scenario_activity_log_uses_safe_label_and_structured_changes(
    client_cro: AsyncClient,
    db_session,
):
    scenario = ApprovalScenario(
        key="activity_scenario",
        display_name="Activity Scenario",
        description="Scenario used for activity-log coverage",
        requires_approval=True,
        approver_roles='["risk_manager", "cro"]',
    )
    db_session.add(scenario)
    await db_session.commit()
    await db_session.refresh(scenario)

    update_response = await client_cro.patch(
        "/api/v1/riskhub/approval-scenarios/activity_scenario",
        json={
            "requires_approval": False,
            "approver_roles": ["cro"],
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["capabilities"] == {"can_update": True}

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.entity_type == ActivityEntityType.CONFIG.value,
            ActivityLog.entity_id == scenario.id,
            ActivityLog.action == ActivityAction.UPDATE.value,
            ActivityLog.description == "Updated Config (fields: requires_approval, approver_roles)",
        )
    )
    entry = result.scalars().first()
    assert entry is not None
    assert entry.entity_name == "Activity Scenario"
    assert entry.changes["requires_approval"]["old"] is True
    assert entry.changes["requires_approval"]["new"] is False
    assert entry.changes["approver_roles"]["old"] == ["risk_manager", "cro"]
    assert entry.changes["approver_roles"]["new"] == ["cro"]

    search_response = await client_cro.get(
        "/api/v1/activity-log",
        params={"search": "Activity Scenario"},
    )
    assert search_response.status_code == 200
    assert any(item["entity_id"] == scenario.id for item in search_response.json()["items"])


@pytest.mark.asyncio
async def test_activity_log_uses_identical_sanitized_changes_for_db_and_siem(db_session, monkeypatch):
    emitted: dict[str, object] = {}

    def capture(event: str, **kwargs: object) -> None:
        emitted["event"] = event
        emitted.update(kwargs)

    monkeypatch.setattr(audit_logger, "info", capture)

    await log_activity(
        db_session,
        entity_type=ActivityEntityType.KRI,
        entity_id=41,
        entity_name="Audit KRI",
        action=ActivityAction.UPDATE,
        actor=None,
        department_id=None,
        changes={
            "description": {"old": "hidden old", "new": "hidden new"},
            "last_error": {"old": "old trace", "new": "new trace"},
            "session_id": {"old": "session-old", "new": "session-new"},
            "status": {"old": "active", "new": "inactive"},
        },
    )
    await db_session.commit()

    result = await db_session.execute(select(ActivityLog).where(ActivityLog.entity_id == 41))
    entry = result.scalars().first()
    assert entry is not None
    assert entry.changes["last_error"]["new"] == "[REDACTED]"
    assert entry.changes["session_id"]["new"] == "[REDACTED]"
    assert emitted["changes"] == entry.changes
    assert emitted["description"] == entry.description
    assert emitted["entity_name"] == "Kri"
    assert "actor_name" not in emitted
    assert emitted["metadata_redaction_count"] >= 1


@pytest.mark.asyncio
async def test_user_auth_session_fields_are_allowlisted_for_activity_logs(db_session, monkeypatch):
    emitted: dict[str, object] = {}

    def capture(event: str, **kwargs: object) -> None:
        emitted["event"] = event
        emitted.update(kwargs)

    monkeypatch.setattr(audit_logger, "info", capture)

    await log_activity(
        db_session,
        entity_type=ActivityEntityType.USER,
        entity_id=77,
        entity_name="Test User",
        action=ActivityAction.REFRESH,
        actor=None,
        department_id=None,
        changes={
            "revoke_count": 1,
            "context_changed": True,
            "failure_code": "expired",
            "logout_scope": "all_devices",
        },
        safe_description="User refreshed session",
        safe_description_siem="User refreshed session",
    )
    await db_session.commit()

    result = await db_session.execute(select(ActivityLog).where(ActivityLog.entity_id == 77))
    entry = result.scalars().one()
    assert entry.changes == {
        "revoke_count": 1,
        "context_changed": True,
        "failure_code": "expired",
        "logout_scope": "all_devices",
    }
    assert emitted["changes"] == entry.changes


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_activity_log_accepts_refresh_action_under_postgres_constraint(db_session):
    await log_activity(
        db_session,
        entity_type=ActivityEntityType.USER,
        entity_id=78,
        entity_name="Postgres User",
        action=ActivityAction.REFRESH,
        actor=None,
        department_id=None,
        safe_description="User refreshed session",
        safe_description_siem="User refreshed session",
    )
    await db_session.commit()

    result = await db_session.execute(select(ActivityLog).where(ActivityLog.entity_id == 78))
    entry = result.scalars().one()
    assert entry.action == ActivityAction.REFRESH.value


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

    result = await db_session.execute(select(ActivityLog).where(ActivityLog.entity_id == 30))
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
            assert any(item["entity_id"] == 100 for item in items)
            assert all(item["entity_id"] != 101 for item in items)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/activity-log",
        "/api/v1/activity-log/entity-types",
        "/api/v1/activity-log/actions",
    ],
)
async def test_platform_admin_is_denied_business_activity_log(
    client_platform_admin: AsyncClient,
    path: str,
):
    response = await client_platform_admin.get(path)

    assert response.status_code == 403
    assert response.json()["detail"] == "Platform admins cannot access the business Activity Log"
