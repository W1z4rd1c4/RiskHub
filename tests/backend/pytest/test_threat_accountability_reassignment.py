"""Threat Steward accountability approval behavior for ICT-GOV #88."""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    GovernedMutationImpactLock,
    Notification,
    NotificationType,
    Permission,
    Role,
    RolePermission,
    Threat,
    User,
)
from app.models.user import AccessScope


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
    active: bool = True,
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
        is_active=active,
    )
    db.add(user)
    await db.commit()
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.role)
            .selectinload(Role.permissions)
            .selectinload(RolePermission.permission)
        )
        .where(User.id == user.id)
    )
    return result.scalar_one()


async def _pending_transfer(
    *,
    client_factory,
    db: AsyncSession,
    requester: User,
    department_id: int,
    suffix: str,
) -> tuple[Threat, User, User, dict]:
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
    return threat, current_steward, proposed_steward, response.json()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("managing_end", "operation"),
    [
        ("threat", "add"),
        ("threat", "remove"),
        ("risk", "add"),
        ("risk", "remove"),
    ],
)
async def test_pending_threat_proposal_blocks_risk_link_mutations_from_both_ends(
    client_factory,
    db_session: AsyncSession,
    seed_risk_types,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
    managing_end: str,
    operation: str,
) -> None:
    del seed_risk_types, test_user_risk_manager
    await _seed_accountability_scenario(db_session)
    current_steward = await _create_ciso(
        db_session,
        role=None,
        name=f"Current link {managing_end} {operation}",
        email=f"current-link-{managing_end}-{operation}@test.local",
        department_id=test_department.id,
    )
    proposed_steward = await _create_ciso(
        db_session,
        role=current_steward.role,
        name=f"Proposed link {managing_end} {operation}",
        email=f"proposed-link-{managing_end}-{operation}@test.local",
        department_id=test_department.id,
    )
    threat = Threat(
        name=f"Pending link {managing_end} {operation}",
        threat_steward_user_id=current_steward.id,
    )
    db_session.add(threat)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        risk_response = await client.post(
            "/api/v1/risks",
            json={
                "name": f"Risk link {managing_end} {operation}",
                "process": "Threat proposal link guard",
                "description": "The pending Threat proposal owns the impact lock.",
            },
        )
        assert risk_response.status_code == 201, risk_response.text
        risk = risk_response.json()

        if managing_end == "threat":
            collection_url = f"/api/v1/threats/{threat.id}/risk-links"
            create_payload = {"risk_id": risk["id"]}
        else:
            collection_url = f"/api/v1/risks/{risk['id']}/threat-links"
            create_payload = {"threat_id": threat.id}

        link_id: int | None = None
        if operation == "remove":
            linked = await client.post(collection_url, json=create_payload)
            assert linked.status_code == 201, linked.text
            link_id = linked.json()["id"]

        submitted = await client.patch(
            f"/api/v1/threats/{threat.id}",
            json={
                "threat_steward_user_id": proposed_steward.id,
                "request_reason": "Queue the Threat proposal before changing links",
            },
        )
        assert submitted.status_code == 202, submitted.text

        if operation == "add":
            conflicted = await client.post(collection_url, json=create_payload)
        else:
            assert link_id is not None
            conflicted = await client.delete(f"{collection_url}/{link_id}")

        assert conflicted.status_code == 409, conflicted.text
        assert conflicted.json()["detail"]["code"] == "threat_pending_mutation"
        rows = (await client.get(collection_url)).json()
        assert [row["id"] for row in rows] == (
            [] if operation == "add" else [link_id]
        )


@pytest.mark.asyncio
async def test_threat_steward_reassignment_waits_for_approval(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _seed_accountability_scenario(db_session)
    current_steward = await _create_ciso(
        db_session,
        role=None,
        name="Current Threat Steward",
        email="current-threat-steward@test.local",
        department_id=test_department.id,
    )
    proposed_steward = await _create_ciso(
        db_session,
        role=current_steward.role,
        name="Proposed Threat Steward",
        email="proposed-threat-steward@test.local",
        department_id=test_department.id,
    )
    threat = Threat(
        name="Accountability tracer threat",
        threat_steward_user_id=current_steward.id,
    )
    db_session.add(threat)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/threats/{threat.id}",
            json={
                "threat_steward_user_id": proposed_steward.id,
                "request_reason": "Transfer Threat accountability",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert submitted.json()["action_type"] == "edit"
    assert submitted.json()["pending_fields"] == ["threat_steward"]
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == current_steward.id
    assert threat.governance_version == 1

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Threat Steward transfer approved"},
        )

    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == proposed_steward.id
    assert threat.governance_version == 2


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_threat_approval_reloads_requester_authority(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    test_department,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL request-session loading is authoritative")
    await _seed_accountability_scenario(db_session)
    threat_write = Permission(
        resource="threats",
        action="write",
        description="Write Threats as the current steward",
    )
    requester_role = Role(
        name="ciso",
        display_name="Chief Information Security Officer",
        is_active=True,
    )
    db_session.add_all([threat_write, requester_role])
    await db_session.flush()
    db_session.add(
        RolePermission(
            role_id=requester_role.id,
            permission_id=threat_write.id,
        )
    )
    requester_user = User(
        name="Current Fresh-Session Steward",
        email="current-fresh-session-steward@test.local",
        role_id=requester_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add(requester_user)
    await db_session.commit()
    proposed_steward = await _create_ciso(
        db_session,
        role=requester_role,
        name="Proposed Fresh-Session Steward",
        email="proposed-fresh-session-steward@test.local",
        department_id=test_department.id,
    )
    threat = Threat(
        name="Fresh-session accountability approval",
        threat_steward_user_id=requester_user.id,
    )
    db_session.add(threat)
    await db_session.commit()

    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    settings = Settings(mock_auth_enabled=True, debug=True)
    async with client_factory(
        user=requester_user,
        settings=settings,
        db_override=override_get_db,
    ) as requester:
        submitted = await requester.patch(
            f"/api/v1/threats/{threat.id}",
            json={
                "threat_steward_user_id": proposed_steward.id,
                "request_reason": "Exercise fresh requester authorization loading",
            },
        )

    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    async with client_factory(
        user=test_user_risk_manager,
        settings=settings,
        db_override=override_get_db,
        raise_app_exceptions=False,
    ) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Fresh-session authority revalidated"},
        )

    async with client_factory(
        user=test_user_risk_manager,
        settings=settings,
        db_override=override_get_db,
    ) as reviewer:
        detail = await reviewer.get(f"/api/v1/approvals/{approval_id}")

    assert detail.status_code == 200, detail.text
    assert approved.status_code == 200, (
        f"{approved.text}; approval status after failure: "
        f"{detail.json()['status']}"
    )
    assert approved.json()["status"] == "approved"
    assert detail.json()["status"] == "approved"
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == proposed_steward.id
    assert threat.governance_version == 2


@pytest.mark.asyncio
async def test_threat_steward_is_required_and_same_value_is_a_direct_no_op(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
) -> None:
    await _seed_accountability_scenario(db_session)
    steward = await _create_ciso(
        db_session,
        role=None,
        name="Stable Threat Steward",
        email="stable-threat-steward@test.local",
        department_id=test_department.id,
    )
    threat = Threat(name="Stable stewardship", threat_steward_user_id=steward.id)
    db_session.add(threat)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        same_value = await requester.patch(
            f"/api/v1/threats/{threat.id}",
            json={"threat_steward_user_id": steward.id},
        )
        cleared = await requester.patch(
            f"/api/v1/threats/{threat.id}",
            json={"threat_steward_user_id": None},
        )

    assert same_value.status_code == 200, same_value.text
    assert cleared.status_code == 422, cleared.text
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == steward.id
    assert threat.governance_version == 1
    assert await db_session.scalar(select(func.count(ApprovalRequest.id))) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_target", ["inactive_user", "inactive_role", "non_ciso"])
async def test_threat_steward_target_must_be_an_active_ciso(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
    invalid_target: str,
) -> None:
    await _seed_accountability_scenario(db_session)
    current_steward = await _create_ciso(
        db_session,
        role=None,
        name="Eligible Current Steward",
        email="eligible-current-steward@test.local",
        department_id=test_department.id,
    )
    if invalid_target == "non_ciso":
        target = test_user_employee
    else:
        target = await _create_ciso(
            db_session,
            role=current_steward.role,
            name=f"Invalid {invalid_target}",
            email=f"invalid-{invalid_target}@test.local",
            department_id=test_department.id,
            active=invalid_target != "inactive_user",
        )
        if invalid_target == "inactive_role":
            current_steward.role.is_active = False
            await db_session.commit()
    threat = Threat(
        name=f"Invalid target {invalid_target}",
        threat_steward_user_id=current_steward.id,
    )
    db_session.add(threat)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        response = await requester.patch(
            f"/api/v1/threats/{threat.id}",
            json={
                "threat_steward_user_id": target.id,
                "request_reason": "Invalid target must not queue",
            },
        )

    assert response.status_code == 400, response.text
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == current_steward.id
    assert threat.governance_version == 1
    assert await db_session.scalar(select(func.count(ApprovalRequest.id))) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal_action", ["reject", "cancel"])
async def test_threat_steward_terminal_without_approval_preserves_truth(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
    terminal_action: str,
) -> None:
    await _seed_accountability_scenario(db_session)
    threat, current_steward, _target, submitted = await _pending_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix=terminal_action,
    )

    actor = (
        test_user_risk_manager
        if terminal_action == "reject"
        else test_user_cro
    )
    async with client_factory(user=actor) as client:
        if terminal_action == "reject":
            terminal = await client.post(
                f"/api/v1/approvals/{submitted['approval_id']}/reject",
                json={"resolution_notes": "Transfer rejected"},
            )
        else:
            terminal = await client.post(
                f"/api/v1/approvals/{submitted['approval_id']}/cancel"
            )

    assert terminal.status_code == 200, terminal.text
    assert terminal.json()["status"] == (
        "rejected" if terminal_action == "reject" else "cancelled"
    )
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == current_steward.id
    assert threat.governance_version == 1


@pytest.mark.asyncio
async def test_threat_steward_requester_cannot_self_approve_or_reject(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    del test_user_risk_manager
    await _seed_accountability_scenario(db_session)
    threat, current_steward, _target, submitted = await _pending_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix="no-self",
    )

    async with client_factory(user=test_user_cro) as requester:
        approved = await requester.post(
            f"/api/v1/approvals/{submitted['approval_id']}/approve",
            json={"resolution_notes": "Self approval forbidden"},
        )
        rejected = await requester.post(
            f"/api/v1/approvals/{submitted['approval_id']}/reject",
            json={"resolution_notes": "Self rejection forbidden"},
        )

    assert approved.status_code == 403, approved.text
    assert rejected.status_code == 403, rejected.text
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == current_steward.id
    assert threat.governance_version == 1


@pytest.mark.asyncio
async def test_threat_steward_submission_requires_independent_approver(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
) -> None:
    db_session.add(
        ApprovalScenario(
            key="accountability_reassignment",
            display_name="Accountability reassignments",
            description="Independent approval for accountability reassignments",
            requires_approval=True,
            approver_roles=["cro"],
        )
    )
    await db_session.commit()
    current_steward = await _create_ciso(
        db_session,
        role=None,
        name="Current Missing Approver",
        email="current-missing-approver@test.local",
        department_id=test_department.id,
    )
    target = await _create_ciso(
        db_session,
        role=current_steward.role,
        name="Target Missing Approver",
        email="target-missing-approver@test.local",
        department_id=test_department.id,
    )
    threat = Threat(
        name="Missing independent approver",
        threat_steward_user_id=current_steward.id,
    )
    db_session.add(threat)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/threats/{threat.id}",
            json={
                "threat_steward_user_id": target.id,
                "request_reason": "Must have another approver",
            },
        )

    assert submitted.status_code == 400, submitted.text
    assert (
        submitted.json()["detail"]["code"]
        == "governed_mutation_independent_approver_required"
    )
    assert await db_session.scalar(select(func.count(ApprovalRequest.id))) == 0


@pytest.mark.asyncio
async def test_threat_steward_version_drift_expires_without_applying(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _seed_accountability_scenario(db_session)
    threat, current_steward, _target, submitted = await _pending_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix="stale",
    )
    threat.governance_version += 1
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        expired = await approver.post(
            f"/api/v1/approvals/{submitted['approval_id']}/approve",
            json={"resolution_notes": "Must expire"},
        )

    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == current_steward.id
    assert threat.governance_version == 2


@pytest.mark.asyncio
async def test_disabled_live_threat_scenario_is_expired_by_snapshot_authorized_resolver(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _seed_accountability_scenario(db_session)
    threat, current_steward, _target, submitted = await _pending_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix="disabled-live-scenario",
    )
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "accountability_reassignment"
        )
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        expired = await approver.post(
            f"/api/v1/approvals/{submitted['approval_id']}/approve",
            json={"resolution_notes": "Expire disabled policy request"},
        )

    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == current_steward.id
    assert threat.governance_version == 1
    assert (
        await db_session.scalar(
            select(func.count(GovernedMutationImpactLock.id)).where(
                GovernedMutationImpactLock.released_at.is_(None)
            )
        )
        == 0
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("requester_change", ["inactive", "authorization_removed"])
async def test_threat_resolution_expires_when_requester_is_no_longer_authorized(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
    requester_change: str,
) -> None:
    await _seed_accountability_scenario(db_session)
    threat, current_steward, _target, submitted = await _pending_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix=f"requester-{requester_change}",
    )
    if requester_change == "inactive":
        test_user_cro.is_active = False
    else:
        test_user_cro.role_id = test_user_employee.role_id
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        expired = await approver.post(
            f"/api/v1/approvals/{submitted['approval_id']}/approve",
            json={"resolution_notes": "Revalidate requester"},
        )

    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == current_steward.id
    assert threat.governance_version == 1


@pytest.mark.asyncio
async def test_threat_steward_queue_and_notification_visibility_are_identity_bound(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    await _seed_accountability_scenario(db_session)
    _threat, _current, _target, submitted = await _pending_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix="visibility",
    )
    notifications = [
        Notification(
            user_id=user.id,
            type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
            title="Threat approval",
            message="Threat Steward transfer requires review",
            resource_type="approval",
            resource_id=submitted["approval_id"],
        )
        for user in (
            test_user_risk_manager,
            test_user_cro,
            test_user_employee,
        )
    ]
    db_session.add_all(notifications)
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as reviewer:
        queue = await reviewer.get("/api/v1/approvals?status=pending")
        reviewer_notifications = await reviewer.get("/api/v1/notifications")
    async with client_factory(user=test_user_cro) as requester:
        requester_notifications = await requester.get("/api/v1/notifications")
    async with client_factory(user=test_user_employee) as excluded:
        excluded_notifications = await excluded.get("/api/v1/notifications")

    assert queue.status_code == 200, queue.text
    item = next(
        row
        for row in queue.json()["items"]
        if row["id"] == submitted["approval_id"]
    )
    assert item["resource_type"] == "threat"
    assert item["governed_mutation"]["mutation_kind"] == "threat.edit"
    assert item["governed_mutation"]["before"] == {
        "threat_steward": "Current Steward visibility"
    }
    assert item["governed_mutation"]["after"] == {
        "threat_steward": "Proposed Steward visibility"
    }
    assert item["governed_mutation"]["derived_impact"] == {
        "before": {},
        "after": {},
    }
    assert item["governed_mutation"]["impacted_resources"] == [
        {
            "resource_type": "threat",
            "resource_name": "Restricted Threat",
        }
    ]
    assert reviewer_notifications.status_code == 200
    assert requester_notifications.status_code == 200
    assert excluded_notifications.status_code == 200
    assert reviewer_notifications.json()["total"] == 1
    assert requester_notifications.json()["total"] == 1
    assert excluded_notifications.json()["total"] == 0


@pytest.mark.asyncio
async def test_threat_notification_visibility_is_equivalent_with_candidate_bounding(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    """Bounding Threat validation to notification-linked ids must not change visibility."""
    await _seed_accountability_scenario(db_session)
    _threat, _current, _target, submitted = await _pending_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix="equivalence",
    )
    ciso_role = (
        await db_session.execute(select(Role).where(Role.name == "ciso"))
    ).scalar_one()
    current_two = await _create_ciso(
        db_session,
        role=ciso_role,
        name="Current Steward equivalence-unlinked",
        email="current-equivalence-unlinked@test.local",
        department_id=test_department.id,
    )
    proposed_two = await _create_ciso(
        db_session,
        role=ciso_role,
        name="Proposed Steward equivalence-unlinked",
        email="proposed-equivalence-unlinked@test.local",
        department_id=test_department.id,
    )
    threat_two = Threat(
        name="Threat equivalence-unlinked",
        threat_steward_user_id=current_two.id,
    )
    db_session.add(threat_two)
    await db_session.commit()
    async with client_factory(user=test_user_cro) as second_requester:
        second_response = await second_requester.patch(
            f"/api/v1/threats/{threat_two.id}",
            json={
                "threat_steward_user_id": proposed_two.id,
                "request_reason": "Transfer equivalence-unlinked",
            },
        )
    assert second_response.status_code == 202, second_response.text
    unlinked = second_response.json()
    assert unlinked["approval_id"] != submitted["approval_id"]
    db_session.add_all(
        [
            Notification(
                user_id=user.id,
                type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
                title="Threat approval",
                message="Threat Steward transfer requires review",
                resource_type="approval",
                resource_id=submitted["approval_id"],
            )
            for user in (
                test_user_risk_manager,
                test_user_cro,
                test_user_employee,
            )
        ]
    )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as reviewer:
        reviewer_notifications = await reviewer.get("/api/v1/notifications")
    async with client_factory(user=test_user_cro) as requester:
        requester_notifications = await requester.get("/api/v1/notifications")
    async with client_factory(user=test_user_employee) as excluded:
        excluded_notifications = await excluded.get("/api/v1/notifications")

    assert reviewer_notifications.status_code == 200
    assert requester_notifications.status_code == 200
    assert excluded_notifications.status_code == 200
    reviewer_payload = reviewer_notifications.json()
    requester_payload = requester_notifications.json()
    assert reviewer_payload["total"] == 1
    assert [row["resource_id"] for row in reviewer_payload["items"]] == [submitted["approval_id"]]
    assert requester_payload["total"] == 1
    assert [row["resource_id"] for row in requester_payload["items"]] == [submitted["approval_id"]]
    assert excluded_notifications.json()["total"] == 0


@pytest.mark.asyncio
async def test_threat_read_projects_safe_pending_change_and_clears_after_cancel(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _seed_accountability_scenario(db_session)
    threat, _current, _target, submitted = await _pending_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=test_user_cro,
        department_id=test_department.id,
        suffix="pending-overlay",
    )

    async with client_factory(user=test_user_cro) as requester:
        detail = await requester.get(f"/api/v1/threats/{threat.id}")
        listed = await requester.get("/api/v1/threats?offset=0&limit=100")

    assert detail.status_code == 200, detail.text
    pending = detail.json()["pending_change"]
    assert pending == {
        "approval_id": submitted["approval_id"],
        "proposal_id": submitted["proposal_id"],
        "proposal_version": 1,
        "status": "pending",
        "requested_at": pending["requested_at"],
        "requested_by_name": test_user_cro.name,
        "reason": "Transfer pending-overlay",
        "generic_label": "accountability_reassignment",
        "mutation_kind": "threat.edit",
        "before": {"threat_steward": "Current Steward pending-overlay"},
        "after": {"threat_steward": "Proposed Steward pending-overlay"},
        "derived_impact": {"before": {}, "after": {}},
        "impacted_resources": [
            {
                "resource_type": "threat",
                "resource_name": "Restricted Threat",
            }
        ],
        "capabilities": {"can_view_diff": True, "can_cancel": True},
    }
    assert detail.json()["capabilities"] == {
        "can_read": True,
        "can_update": False,
        "can_archive": False,
        "can_restore": False,
        "has_pending_change": True,
        "business_edit_blocked": True,
        "can_cancel_pending_change": True,
    }
    listed_row = next(
        row for row in listed.json()["items"] if row["id"] == threat.id
    )
    assert listed_row["pending_change"] == pending

    async with client_factory(user=test_user_cro) as requester:
        cancelled = await requester.post(
            f"/api/v1/approvals/{submitted['approval_id']}/cancel"
        )
        refreshed = await requester.get(f"/api/v1/threats/{threat.id}")

    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["pending_change"] is None
    assert refreshed.json()["capabilities"]["has_pending_change"] is False
    assert refreshed.json()["capabilities"]["business_edit_blocked"] is False


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_crossed_threat_resolutions_do_not_deadlock(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row locks are authoritative")
    await _seed_accountability_scenario(db_session)
    threat_write_permission = Permission(
        resource="threats",
        action="write",
        description="Write Threats during crossed resolution test",
    )
    db_session.add(threat_write_permission)
    await db_session.flush()
    db_session.add(
        RolePermission(
            role_id=test_user_risk_manager.role_id,
            permission_id=threat_write_permission.id,
        )
    )
    await db_session.commit()
    db_session.expire(test_user_risk_manager.role, ["permissions"])
    ciso_role = Role(
        name="ciso",
        display_name="Chief Information Security Officer",
        is_active=True,
    )
    db_session.add(ciso_role)
    await db_session.flush()
    stewards = [
        User(
            name=f"Crossed Threat Steward {index}",
            email=f"crossed-threat-steward-{index}@test.local",
            role_id=ciso_role.id,
            department_id=test_department.id,
            access_scope=AccessScope.GLOBAL,
            is_active=True,
        )
        for index in range(4)
    ]
    db_session.add_all(stewards)
    await db_session.flush()
    threats = [
        Threat(
            name=f"Crossed resolution Threat {index}",
            threat_steward_user_id=stewards[index * 2].id,
        )
        for index in range(2)
    ]
    db_session.add_all(threats)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        cro_submission = await requester.patch(
            f"/api/v1/threats/{threats[0].id}",
            json={
                "threat_steward_user_id": stewards[1].id,
                "request_reason": "Crossed resolver order CRO request",
            },
        )
    async with client_factory(user=test_user_risk_manager) as requester:
        manager_submission = await requester.patch(
            f"/api/v1/threats/{threats[1].id}",
            json={
                "threat_steward_user_id": stewards[3].id,
                "request_reason": "Crossed resolver order manager request",
            },
        )
    assert cro_submission.status_code == 202, cro_submission.text
    assert manager_submission.status_code == 202, manager_submission.text

    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    settings = Settings(mock_auth_enabled=True, debug=True)
    async with (
        session_maker() as cro_blocker,
        session_maker() as manager_blocker,
    ):
        await cro_blocker.execute(
            select(User)
            .where(User.id == test_user_cro.id)
            .with_for_update()
        )
        await manager_blocker.execute(
            select(User)
            .where(User.id == test_user_risk_manager.id)
            .with_for_update()
        )
        async with (
            client_factory(
                user=test_user_cro,
                settings=settings,
                db_override=override_get_db,
            ) as cro_resolver,
            client_factory(
                user=test_user_risk_manager,
                settings=settings,
                db_override=override_get_db,
            ) as manager_resolver,
        ):
            cro_task = asyncio.create_task(
                cro_resolver.post(
                    f"/api/v1/approvals/{manager_submission.json()['approval_id']}/approve",
                    json={"resolution_notes": "CRO resolves manager request"},
                )
            )
            manager_task = asyncio.create_task(
                manager_resolver.post(
                    f"/api/v1/approvals/{cro_submission.json()['approval_id']}/approve",
                    json={"resolution_notes": "Manager resolves CRO request"},
                )
            )
            await asyncio.sleep(0.1)
            assert not cro_task.done()
            assert not manager_task.done()
            await asyncio.gather(
                cro_blocker.commit(),
                manager_blocker.commit(),
            )
            cro_response, manager_response = await asyncio.wait_for(
                asyncio.gather(cro_task, manager_task),
                timeout=10,
            )

    assert cro_response.status_code == 200, cro_response.text
    assert manager_response.status_code == 200, manager_response.text
    assert cro_response.json()["status"] == "approved"
    assert manager_response.json()["status"] == "approved"


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_same_threat_patch_and_resolution_do_not_deadlock(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row locks are authoritative")
    await _seed_accountability_scenario(db_session)
    threat, current_steward, proposed_steward, submitted = (
        await _pending_transfer(
            client_factory=client_factory,
            db=db_session,
            requester=test_user_cro,
            department_id=test_department.id,
            suffix="same-threat-race",
        )
    )
    competing_steward = await _create_ciso(
        db_session,
        role=current_steward.role,
        name="Competing same-Threat Steward",
        email="competing-same-threat-steward@test.local",
        department_id=test_department.id,
    )

    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    settings = Settings(mock_auth_enabled=True, debug=True)
    async with session_maker() as threat_blocker:
        blocker_pid = await threat_blocker.scalar(text("SELECT pg_backend_pid()"))
        await threat_blocker.execute(
            select(Threat)
            .where(Threat.id == threat.id)
            .with_for_update()
        )
        async with (
            client_factory(
                user=test_user_cro,
                settings=settings,
                db_override=override_get_db,
                raise_app_exceptions=False,
            ) as ordinary_editor,
            client_factory(
                user=test_user_risk_manager,
                settings=settings,
                db_override=override_get_db,
                raise_app_exceptions=False,
            ) as approver,
        ):
            patch_task = asyncio.create_task(
                ordinary_editor.patch(
                    f"/api/v1/threats/{threat.id}",
                    json={
                        "threat_steward_user_id": competing_steward.id,
                        "request_reason": "Competing same-Threat reassignment",
                    },
                )
            )
            for _ in range(200):
                await threat_blocker.execute(
                    text("SELECT pg_stat_clear_snapshot()")
                )
                patch_is_waiting = await threat_blocker.scalar(
                    text(
                        "SELECT EXISTS ("
                        "SELECT 1 FROM pg_stat_activity "
                        "WHERE datname = current_database() "
                        "AND pid != :blocker_pid "
                        "AND state = 'active' "
                        "AND wait_event_type = 'Lock'"
                        ")"
                    ),
                    {"blocker_pid": blocker_pid},
                )
                if patch_is_waiting:
                    break
                await asyncio.sleep(0.01)
            else:
                raise AssertionError(
                    "The ordinary PATCH must wait on the locked Threat row"
                )
            assert not patch_task.done()
            approval_task = asyncio.create_task(
                approver.post(
                    f"/api/v1/approvals/{submitted['approval_id']}/approve",
                    json={"resolution_notes": "Resolve the original reassignment"},
                )
            )
            for _ in range(200):
                await threat_blocker.execute(
                    text("SELECT pg_stat_clear_snapshot()")
                )
                approval_reached_shared_lock_plan = await threat_blocker.scalar(
                    text(
                        "SELECT ("
                        "SELECT count(*) FROM pg_stat_activity "
                        "WHERE datname = current_database() "
                        "AND pid != :blocker_pid AND state = 'active' "
                        "AND wait_event_type = 'Lock'"
                        ") >= 2 OR EXISTS ("
                        "SELECT 1 FROM pg_locks AS advisory "
                        "JOIN pg_stat_activity AS activity "
                        "ON activity.pid = advisory.pid "
                        "WHERE advisory.locktype = 'advisory' "
                        "AND advisory.granted "
                        "AND activity.datname = current_database() "
                        "AND activity.pid != :blocker_pid "
                        "AND activity.state = 'active' "
                        "AND activity.wait_event_type = 'Lock'"
                        ")"
                    ),
                    {"blocker_pid": blocker_pid},
                )
                if approval_reached_shared_lock_plan:
                    break
                await asyncio.sleep(0.01)
            else:
                raise AssertionError(
                    "Both public requests must wait on the same Threat row"
                )
            assert not approval_task.done()
            await threat_blocker.commit()
            patch_response, approval_response = await asyncio.wait_for(
                asyncio.gather(patch_task, approval_task),
                timeout=10,
            )

    assert patch_response.status_code == 409, patch_response.text
    assert patch_response.json()["detail"]["code"] == "threat_pending_mutation"
    assert approval_response.status_code == 200, approval_response.text
    assert approval_response.json()["status"] == "approved"
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == proposed_steward.id


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_threat_resolution_serializes_requester_permission_removal(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    test_department,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL Role row locks are authoritative")
    await _seed_accountability_scenario(db_session)
    threat_permissions = [
        Permission(
            resource="threats",
            action=action,
            description=f"{action.title()} Threats during permission serialization test",
        )
        for action in ("read", "write")
    ]
    db_session.add_all(threat_permissions)
    await db_session.flush()
    permission_by_action = {
        permission.action: permission
        for permission in threat_permissions
    }
    requester_role = Role(
        name="threat_resolution_requester",
        display_name="Threat Resolution Requester",
        is_active=True,
    )
    db_session.add(requester_role)
    await db_session.flush()
    db_session.add_all(
        RolePermission(
            role_id=requester_role.id,
            permission_id=permission_by_action[action].id,
        )
        for action in ("read", "write")
    )
    requester = User(
        name="Threat permission requester",
        email="threat-permission-requester@test.local",
        role_id=requester_role.id,
        department_id=test_department.id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add(requester)
    await db_session.commit()
    requester = (
        await db_session.execute(
            select(User)
            .options(
                selectinload(User.role)
                .selectinload(Role.permissions)
                .selectinload(RolePermission.permission),
                selectinload(User.department),
            )
            .where(User.id == requester.id)
        )
    ).scalar_one()
    threat, current_steward, _target, submitted = await _pending_transfer(
        client_factory=client_factory,
        db=db_session,
        requester=requester,
        department_id=test_department.id,
        suffix="permission-serialization",
    )

    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with session_maker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    settings = Settings(mock_auth_enabled=True, debug=True)
    async with session_maker() as role_blocker:
        await role_blocker.execute(
            select(Role)
            .where(Role.id == requester_role.id)
            .with_for_update()
        )
        async with (
            client_factory(
                user=test_user_cro,
                settings=settings,
                db_override=override_get_db,
            ) as role_admin,
            client_factory(
                user=test_user_risk_manager,
                settings=settings,
                db_override=override_get_db,
            ) as approver,
        ):
            role_task = asyncio.create_task(
                role_admin.patch(
                    f"/api/v1/riskhub/roles/{requester_role.id}",
                    json={
                        "permission_ids": [
                            permission_by_action["read"].id
                        ]
                    },
                )
            )
            await asyncio.sleep(0.1)
            role_waited = not role_task.done()
            approval_task = asyncio.create_task(
                approver.post(
                    f"/api/v1/approvals/{submitted['approval_id']}/approve",
                    json={"resolution_notes": "Serialize requester permission"},
                )
            )
            await asyncio.sleep(0.1)
            approval_waited = not approval_task.done()
            await role_blocker.commit()
            role_response, approval_response = await asyncio.wait_for(
                asyncio.gather(role_task, approval_task),
                timeout=10,
            )

    assert role_waited is True
    assert approval_waited is True
    assert role_response.status_code == 200, role_response.text
    assert approval_response.status_code == 200, approval_response.text
    assert approval_response.json()["status"] == "expired"
    await db_session.refresh(threat)
    assert threat.threat_steward_user_id == current_steward.id
