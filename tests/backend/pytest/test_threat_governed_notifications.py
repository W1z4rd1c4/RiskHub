"""Generated notification parity for governed Threat Steward changes."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.models import ApprovalScenario, Role, RolePermission, Threat, User
from app.models.user import AccessScope
from app.services.outbox import dispatch_pending_outbox_events


async def _dispatch_outbox(async_engine: AsyncEngine) -> int:
    session_factory = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    return await dispatch_pending_outbox_events(
        session_factory,
        lock_owner="threat-notification-test",
    )


async def _seed_accountability_scenario(db: AsyncSession) -> None:
    db.add(
        ApprovalScenario(
            key="accountability_reassignment",
            display_name="Accountability reassignments",
            description="Independent approval for accountability reassignments",
            requires_approval=True,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db.commit()


async def _create_ciso(
    db: AsyncSession,
    *,
    role: Role | None,
    name: str,
    email: str,
    department_id: int,
) -> User:
    if role is None:
        role = Role(
            name="ciso",
            display_name="Chief Information Security Officer",
            is_active=True,
        )
        db.add(role)
        await db.flush()
    user = User(
        name=name,
        email=email,
        role_id=role.id,
        department_id=department_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    return (
        await db.execute(
            select(User)
            .options(
                selectinload(User.role)
                .selectinload(Role.permissions)
                .selectinload(RolePermission.permission)
            )
            .where(User.id == user.id)
        )
    ).scalar_one()


async def _submit_transfer(
    *,
    client_factory,
    db: AsyncSession,
    requester: User,
    department_id: int,
    suffix: str,
) -> tuple[Threat, dict]:
    current_steward = await _create_ciso(
        db,
        role=None,
        name=f"Current Steward {suffix}",
        email=f"current-{suffix}@test.local",
        department_id=department_id,
    )
    proposed_steward = await _create_ciso(
        db,
        role=current_steward.role,
        name=f"Proposed Steward {suffix}",
        email=f"proposed-{suffix}@test.local",
        department_id=department_id,
    )
    threat = Threat(
        name=f"Threat {suffix}",
        threat_steward_user_id=current_steward.id,
    )
    db.add(threat)
    await db.commit()
    async with client_factory(user=requester) as client:
        response = await client.patch(
            f"/api/v1/threats/{threat.id}",
            json={
                "threat_steward_user_id": proposed_steward.id,
                "request_reason": f"Transfer {suffix}",
            },
        )
    assert response.status_code == 202, response.text
    return threat, response.json()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("terminal_action", "expected_outcome"),
    [
        ("approve", "approved"),
        ("reject", "rejected"),
        ("cancel", "cancelled"),
        ("expire", "expired"),
    ],
)
async def test_threat_governed_notifications_are_generated_and_publicly_manageable(
    client_factory,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
    terminal_action: str,
    expected_outcome: str,
) -> None:
    await _seed_accountability_scenario(db_session)
    threat, submitted = await _submit_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix=f"notification-{terminal_action}",
    )

    assert await _dispatch_outbox(async_engine) == 1
    async with client_factory(user=test_user_risk_manager) as reviewer:
        reviewer_page = await reviewer.get("/api/v1/notifications")
        reviewer_count = await reviewer.get("/api/v1/notifications/unread/count")
    async with client_factory(user=test_user_cro) as requester:
        requester_before_terminal = await requester.get("/api/v1/notifications")

    assert reviewer_page.status_code == 200, reviewer_page.text
    submitted_items = [
        item
        for item in reviewer_page.json()["items"]
        if item["resource_id"] == submitted["approval_id"]
    ]
    assert len(submitted_items) == 1
    assert submitted_items[0]["title"] == "Protected Threat change requires review"
    assert reviewer_count.json() == {"count": 1}
    assert requester_before_terminal.status_code == 200
    assert requester_before_terminal.json()["total"] == 0

    if terminal_action == "expire":
        threat.governance_version += 1
        await db_session.commit()
    actor = test_user_cro if terminal_action == "cancel" else test_user_risk_manager
    async with client_factory(user=actor) as client:
        if terminal_action == "cancel":
            terminal = await client.post(
                f"/api/v1/approvals/{submitted['approval_id']}/cancel"
            )
        else:
            operation = "approve" if terminal_action == "expire" else terminal_action
            terminal = await client.post(
                f"/api/v1/approvals/{submitted['approval_id']}/{operation}",
                json={"resolution_notes": f"Notification {expected_outcome}"},
            )

    assert terminal.status_code == 200, terminal.text
    assert terminal.json()["status"] == expected_outcome
    assert await _dispatch_outbox(async_engine) == 1

    async with client_factory(user=test_user_cro) as requester:
        requester_page = await requester.get("/api/v1/notifications")
        requester_count = await requester.get("/api/v1/notifications/unread/count")
        requester_items = [
            item
            for item in requester_page.json()["items"]
            if item["resource_id"] == submitted["approval_id"]
        ]
        assert len(requester_items) == 1
        assert requester_items[0]["title"] == (
            f"Protected Threat request {expected_outcome}"
        )
        assert requester_count.json() == {"count": 1}
        requester_read = await requester.post(
            f"/api/v1/notifications/{requester_items[0]['id']}/read"
        )
        requester_after_read = await requester.get(
            "/api/v1/notifications/unread/count"
        )

    assert requester_read.status_code == 200, requester_read.text
    assert requester_read.json() == {"unread_count": 0}
    assert requester_after_read.json() == {"count": 0}


@pytest.mark.asyncio
async def test_generated_threat_notification_requires_snapshot_and_live_role(
    client_factory,
    db_session: AsyncSession,
    async_engine: AsyncEngine,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _seed_accountability_scenario(db_session)
    _threat, submitted = await _submit_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix="notification-live-role",
    )
    assert await _dispatch_outbox(async_engine) == 1

    async with client_factory(user=test_user_risk_manager) as reviewer:
        visible = await reviewer.get("/api/v1/notifications")
    notification = next(
        item
        for item in visible.json()["items"]
        if item["resource_id"] == submitted["approval_id"]
    )

    async with client_factory(user=test_user_cro) as config_admin:
        narrowed = await config_admin.patch(
            "/api/v1/riskhub/approval-scenarios/accountability_reassignment",
            json={"approver_roles": ["cro"]},
        )
    assert narrowed.status_code == 200, narrowed.text

    async with client_factory(user=test_user_risk_manager) as reviewer:
        hidden_page = await reviewer.get("/api/v1/notifications")
        hidden_count = await reviewer.get("/api/v1/notifications/unread/count")
        hidden_read = await reviewer.post(
            f"/api/v1/notifications/{notification['id']}/read"
        )

    assert hidden_page.status_code == 200
    assert hidden_page.json()["total"] == 0
    assert hidden_count.json() == {"count": 0}
    assert hidden_read.status_code == 404, hidden_read.text
