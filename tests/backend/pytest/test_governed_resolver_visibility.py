"""Public pending resolver visibility agrees across governed families (#258)."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ActivityLog,
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    Asset,
    AssetVendorLink,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Notification,
    OutboxEvent,
    Permission,
    Process,
    Role,
    RolePermission,
    Threat,
    User,
    Vendor,
)
from app.models.notification import NotificationType
from app.models.user import AccessScope

FAMILIES = ("process", "process_extended", "asset", "vendor", "threat")


@pytest.fixture(autouse=True)
def isolate_shell_cache_between_fixture_databases(monkeypatch):
    # Each case creates a different database with reused User IDs. Keep the
    # production 15-second cache inside a case, but never reuse another DB's data.
    from app.api.v1.endpoints.users import summary
    from app.core.ttl_cache import TTLCache

    monkeypatch.setattr(summary, "SHELL_SUMMARY_CACHE", TTLCache(ttl_seconds=15, max_entries=500))


async def _submit_protected(client_factory, db: AsyncSession, owner: User, family: str) -> int:
    for key in (
        "protected_process_edit",
        "protected_asset_edit",
        "protected_vendor_edit",
        "accountability_reassignment",
    ):
        db.add(
            ApprovalScenario(
                key=key,
                display_name=key,
                description=key,
                requires_approval=True,
                approver_roles=["risk_manager"],
            )
        )
    reason = "Review the proposed governed change"
    if family in ("process", "process_extended"):
        row = Process(
            f_code="F-GUARD",
            l0_area="Operations",
            l1_process="Guard test",
            process_owner_user_id=owner.id,
            owning_department_id=owner.department_id,
            cif_override="yes",
        )
        db.add(row)
        await db.commit()
        path = f"/api/v1/processes/{row.id}"
        method = "DELETE" if family == "process_extended" else "PATCH"
        payload = {"request_reason": reason}
        if family == "process":
            payload["notes"] = "Proposed change"
    elif family == "asset":
        row = Asset(
            name="Guard Asset",
            business_owner_user_id=owner.id,
            ict_owner_user_id=owner.id,
            owning_department_id=owner.department_id,
            preliminary_criticality="low",
        )
        db.add(row)
        await db.commit()
        path, method = f"/api/v1/assets/{row.id}", "PATCH"
        payload = {"preliminary_criticality": "critical", "request_reason": reason}
    elif family == "vendor":
        row = Vendor(
            name="Guard Vendor",
            process="Operations",
            outsourcing_owner_user_id=owner.id,
            department_id=owner.department_id,
            replaceability="not_substitutable",
        )
        db.add(row)
        await db.commit()
        path, method = f"/api/v1/vendors/{row.id}", "PATCH"
        payload = {"description": "Proposed change", "request_reason": reason}
    else:
        role = Role(name="ciso", display_name="CISO", is_active=True)
        db.add(role)
        await db.flush()
        stewards = [
            User(
                name=f"Steward {n}",
                email=f"guard-steward-{n}@test.local",
                role_id=role.id,
                department_id=owner.department_id,
                access_scope=AccessScope.GLOBAL,
                is_active=True,
            )
            for n in range(2)
        ]
        db.add_all(stewards)
        await db.flush()
        row = Threat(name="Guard Threat", threat_steward_user_id=stewards[0].id)
        db.add(row)
        await db.commit()
        path, method = f"/api/v1/threats/{row.id}", "PATCH"
        payload = {"threat_steward_user_id": stewards[1].id, "request_reason": reason}
    async with client_factory(user=owner) as requester:
        response = await requester.request(method, path, json=payload)
    assert response.status_code == 202, response.text
    return response.json()["approval_id"]


async def _unchanged_business_and_decisions(db):
    return [
        list((await db.execute(select(model.__table__).order_by(model.id))).mappings())
        for model in (
            Process,
            Asset,
            AssetVendorLink,
            Vendor,
            Threat,
            ApprovalRequest,
            GovernedMutationProposal,
            GovernedMutationImpactLock,
            ActivityLog,
            OutboxEvent,
            Permission,
        )
    ]


async def _notification(db, user, approval_id):
    # Separate pre-existing rows prove both single-read and bulk-read filtering.
    rows = [
        Notification(
            user_id=user.id,
            type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
            title=f"Review governed proposal {index}",
            message="Visibility parity fixture",
            resource_type="approval",
            resource_id=approval_id,
            is_read=False,
        )
        for index in range(2)
    ]
    db.add_all(rows)
    await db.commit()
    return tuple(row.id for row in rows)


async def _assert_notification_read_state(db, notification_ids, *, visible):
    states = list(
        (
            await db.scalars(
                select(Notification.is_read).where(Notification.id.in_(notification_ids)).order_by(Notification.id)
            )
        ).all()
    )
    assert states == [visible, visible]


async def _surface_visibility(client_factory, user, approval_id, notification_ids):
    notification_id, bulk_notification_id = notification_ids
    async with client_factory(user=user) as client:
        queue = await client.get("/api/v1/approvals?status=pending")
        work = await client.get("/api/v1/approvals/my-approvals")
        badge = await client.get("/api/v1/approvals/pending/count")
        shell = await client.get("/api/v1/users/me/shell-summary")
        detail = await client.get(f"/api/v1/approvals/{approval_id}")
        inbox = await client.get("/api/v1/notifications")
        unread = await client.get("/api/v1/notifications/unread/count")
        one_read = await client.post(f"/api/v1/notifications/{notification_id}/read")
        all_read = await client.post("/api/v1/notifications/read-all")
    for response in (queue, work, badge, shell, inbox, unread):
        assert response.status_code == 200, response.text
    assert all_read.status_code == 204, all_read.text
    return {
        "queue": approval_id in [row["id"] for row in queue.json()["items"]],
        "work": approval_id in [row["id"] for row in work.json()["items"]],
        "badge": badge.json()["count"],
        "shell": shell.json()["pending_approvals_count"],
        "detail": detail.status_code,
        "notification": all(key in [row["id"] for row in inbox.json()["items"]] for key in notification_ids),
        "unread": unread.json()["count"],
        "notification_read": one_read.status_code,
    }


def _expected_visibility(visible):
    return {
        "queue": visible,
        "work": visible,
        "badge": int(visible),
        "shell": int(visible),
        "detail": 200 if visible else 403,
        "notification": visible,
        "unread": 2 * int(visible),
        "notification_read": 200 if visible else 404,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("role_change", ["scenario_added", "actor_reassigned"])
async def test_role_added_after_submission_cannot_see_pending_proposal(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    family: str,
    role_change: str,
):
    outsider = User(
        name="Newly configured CRO",
        email="visibility-outsider@test.local",
        role_id=(test_user_cro.role_id if role_change == "scenario_added" else test_user_risk_manager.role_id),
        department_id=test_user_cro.department_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add(outsider)
    await db_session.commit()
    approval_id = await _submit_protected(client_factory, db_session, test_user_cro, family)
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
    )
    assert proposal.scenario_snapshot["approver_roles"] == ["risk_manager"]
    for scenario in (await db_session.scalars(select(ApprovalScenario))).all():
        scenario.approver_roles = ["risk_manager", "cro"]
    await db_session.commit()
    if role_change == "actor_reassigned":
        async with client_factory(user=outsider) as initial_resolver:
            warmed = await initial_resolver.get("/api/v1/users/me/shell-summary")
        assert warmed.status_code == 200, warmed.text
        assert warmed.json()["pending_approvals_count"] == 1
        outsider.role_id = test_user_cro.role_id
        await db_session.commit()
        await db_session.refresh(outsider, ["role"])
        assert outsider.role.name == "cro"
    notification_id = await _notification(db_session, outsider, approval_id)
    before = await _unchanged_business_and_decisions(db_session)
    actual = await _surface_visibility(client_factory, outsider, approval_id, notification_id)
    assert await _unchanged_business_and_decisions(db_session) == before
    assert actual == _expected_visibility(False)
    await _assert_notification_read_state(db_session, notification_id, visible=False)
    eligible_notifications = await _notification(db_session, test_user_risk_manager, approval_id)
    before = await _unchanged_business_and_decisions(db_session)
    eligible = await _surface_visibility(client_factory, test_user_risk_manager, approval_id, eligible_notifications)
    assert await _unchanged_business_and_decisions(db_session) == before
    assert eligible == _expected_visibility(True)
    await _assert_notification_read_state(db_session, eligible_notifications, visible=True)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "family,field",
    [
        ("asset", "business_owner_user_id"),
        ("asset", "ict_owner_user_id"),
        ("vendor", "outsourcing_owner_user_id"),
    ],
)
async def test_accountability_only_visible_with_unrelated_protection_disabled(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
    family: str,
    field: str,
):
    db_session.add_all(
        [
            ApprovalScenario(
                key=f"protected_{family}_edit",
                display_name="Disabled unrelated policy",
                description="Not triggered",
                requires_approval=False,
                approver_roles=["cro"],
            ),
            ApprovalScenario(
                key="accountability_reassignment",
                display_name="Accountability",
                description="Actual triggering policy",
                requires_approval=True,
                approver_roles=["risk_manager"],
            ),
        ]
    )
    if family == "asset":
        row = Asset(
            name="Accountability-only Asset",
            business_owner_user_id=test_user_cro.id,
            ict_owner_user_id=test_user_cro.id,
            owning_department_id=test_user_cro.department_id,
            preliminary_criticality="low",
        )
    else:
        row = Vendor(
            name="Accountability-only Vendor",
            process="Operations",
            outsourcing_owner_user_id=test_user_cro.id,
            department_id=test_user_cro.department_id,
            replaceability="easily_substitutable",
        )
    db_session.add(row)
    await db_session.commit()
    base_version = row.governance_version
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/{family}s/{row.id}",
            json={
                field: test_user_employee.id,
                "request_reason": "Transfer accountability independently",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
    )
    if family == "asset":
        assert proposal.proposed_changes["triggered_scenarios"] == ["accountability_reassignment"]
    else:
        assert [policy["key"] for policy in proposal.scenario_snapshot["triggered_policies"]] == [
            "accountability_reassignment"
        ]
    assert proposal.scenario_snapshot["approver_roles"] == ["risk_manager"]
    approval = await db_session.get(ApprovalRequest, approval_id)
    assert approval.status == ApprovalStatus.PENDING
    await db_session.refresh(row)
    assert getattr(row, field) == test_user_cro.id
    assert row.governance_version == base_version
    notification_id = await _notification(db_session, test_user_risk_manager, approval_id)
    before = await _unchanged_business_and_decisions(db_session)
    actual = await _surface_visibility(client_factory, test_user_risk_manager, approval_id, notification_id)
    assert await _unchanged_business_and_decisions(db_session) == before
    assert actual == _expected_visibility(True)
    await _assert_notification_read_state(db_session, notification_id, visible=True)

    # Exercise the real outbox notification handler, not only seeded inbox rows.
    from app.services.outbox.handlers.approvals import handle_approval_request_created
    from app.services.outbox.payloads import ApprovalRequestCreatedPayload

    await handle_approval_request_created(db_session, ApprovalRequestCreatedPayload(approval_id=approval_id))
    await db_session.commit()
    delivered = list(
        (
            await db_session.scalars(
                select(Notification).where(
                    Notification.resource_type == "approval",
                    Notification.resource_id == approval_id,
                    Notification.id.not_in(notification_id),
                )
            )
        ).all()
    )
    assert len(delivered) == 1
    assert delivered[0].user_id == test_user_risk_manager.id
    assert delivered[0].is_read is False
    async with client_factory(user=test_user_risk_manager) as resolver:
        inbox = await resolver.get("/api/v1/notifications")
        unread = await resolver.get("/api/v1/notifications/unread/count")
    assert inbox.status_code == 200, inbox.text
    assert delivered[0].id in [item["id"] for item in inbox.json()["items"]]
    assert unread.json() == {"count": 1}
    await db_session.refresh(approval)
    await db_session.refresh(row)
    assert approval.status == ApprovalStatus.PENDING
    assert getattr(row, field) == test_user_cro.id
    assert row.governance_version == base_version


@pytest.mark.asyncio
@pytest.mark.parametrize("family", ["asset", "vendor"])
@pytest.mark.parametrize("live_change", ["one_policy_excludes", "triggered_disabled"])
async def test_composite_visibility_requires_each_actual_live_policy(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
    family: str,
    live_change: str,
):
    policies = [
        ApprovalScenario(
            key=key,
            display_name=key,
            description=key,
            requires_approval=True,
            approver_roles=["risk_manager", "cro"],
        )
        for key in (f"protected_{family}_edit", "accountability_reassignment")
    ]
    outsider = User(
        name="Composite CRO",
        email="composite-cro@test.local",
        role_id=test_user_cro.role_id,
        department_id=test_user_cro.department_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    if family == "asset":
        row = Asset(
            name="Composite Asset",
            business_owner_user_id=test_user_cro.id,
            ict_owner_user_id=test_user_cro.id,
            owning_department_id=test_user_cro.department_id,
            preliminary_criticality="critical",
        )
        field = "business_owner_user_id"
    else:
        row = Vendor(
            name="Composite Vendor",
            process="Operations",
            outsourcing_owner_user_id=test_user_cro.id,
            department_id=test_user_cro.department_id,
            replaceability="not_substitutable",
        )
        field = "outsourcing_owner_user_id"
    db_session.add_all([*policies, outsider, row])
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/{family}s/{row.id}",
            json={
                field: test_user_employee.id,
                "request_reason": "Composite independent accountability review",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
    )
    assert [policy["key"] for policy in proposal.scenario_snapshot["triggered_policies"]] == [
        f"protected_{family}_edit",
        "accountability_reassignment",
    ]
    assert proposal.scenario_snapshot["approver_roles"] == ["risk_manager", "cro"]
    if live_change == "one_policy_excludes":
        policies[1].approver_roles = ["risk_manager"]
    else:
        policies[1].requires_approval = False
    await db_session.commit()
    for actor, visible in (
        (outsider, False),
        (test_user_risk_manager, live_change == "one_policy_excludes"),
    ):
        notifications = await _notification(db_session, actor, approval_id)
        before = await _unchanged_business_and_decisions(db_session)
        actual = await _surface_visibility(client_factory, actor, approval_id, notifications)
        assert await _unchanged_business_and_decisions(db_session) == before
        assert actual == _expected_visibility(visible)
        await _assert_notification_read_state(db_session, notifications, visible=visible)


@pytest.mark.asyncio
@pytest.mark.parametrize("family", FAMILIES)
async def test_requester_terminal_history_remains_independent_of_resolver_role(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    family: str,
):
    approval_id = await _submit_protected(client_factory, db_session, test_user_cro, family)
    async with client_factory(user=test_user_cro) as requester:
        pending = await requester.get(f"/api/v1/approvals/{approval_id}")
        cancelled = await requester.post(f"/api/v1/approvals/{approval_id}/cancel")
    assert pending.status_code == 200, pending.text
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    async with client_factory(user=test_user_risk_manager) as resolver:
        resolver_history = await resolver.get("/api/v1/approvals?status=cancelled")
        resolver_detail = await resolver.get(f"/api/v1/approvals/{approval_id}")
    assert resolver_history.status_code == 200, resolver_history.text
    assert approval_id in [item["id"] for item in resolver_history.json()["items"]]
    assert resolver_detail.status_code == 200, resolver_detail.text
    assert resolver_detail.json()["status"] == "cancelled"
    for policy in (await db_session.scalars(select(ApprovalScenario))).all():
        policy.requires_approval = False
    await db_session.commit()
    before = await _unchanged_business_and_decisions(db_session)
    async with client_factory(user=test_user_cro) as requester:
        history = await requester.get("/api/v1/approvals?my_requests=true&status=cancelled")
        detail = await requester.get(f"/api/v1/approvals/{approval_id}")
    assert history.status_code == 200, history.text
    assert approval_id in [row["id"] for row in history.json()["items"]]
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "cancelled"
    assert await _unchanged_business_and_decisions(db_session) == before


@pytest.mark.asyncio
@pytest.mark.parametrize("family", ["process", "process_extended"])
@pytest.mark.parametrize("drift", ["disabled", "roles_changed"])
async def test_process_stale_live_policy_remains_visible_for_bounded_expiry(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    family: str,
    drift: str,
):
    from app.models.activity_log import ActivityAction, ActivityEntityType
    from app.services.approval_scenario_policy import (
        can_resolve_scenario_approval,
        process_approval_resolver_clause,
    )

    approval_id = await _submit_protected(client_factory, db_session, test_user_cro, family)
    policy = await db_session.scalar(select(ApprovalScenario).where(ApprovalScenario.key == "protected_process_edit"))
    if drift == "disabled":
        policy.requires_approval = False
    else:
        policy.approver_roles = ["cro"]
    await db_session.commit()
    approval = await db_session.get(ApprovalRequest, approval_id)
    assert await can_resolve_scenario_approval(db_session, test_user_risk_manager, approval)
    sql_ids = set(
        (
            await db_session.scalars(
                select(ApprovalRequest.id).where(
                    process_approval_resolver_clause(
                        test_user_risk_manager,
                        valid_extended_approval_ids=(approval_id,),
                    )
                )
            )
        ).all()
    )
    assert approval_id in sql_ids
    notifications = await _notification(db_session, test_user_risk_manager, approval_id)
    before = await _unchanged_business_and_decisions(db_session)
    actual = await _surface_visibility(client_factory, test_user_risk_manager, approval_id, notifications)
    assert actual == _expected_visibility(True)
    assert await _unchanged_business_and_decisions(db_session) == before
    business_before = list((await db_session.execute(select(Process.__table__).order_by(Process.id))).mappings())
    async with client_factory(user=test_user_risk_manager) as resolver:
        expired = await resolver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Review stale policy without applying business change"},
        )
    assert expired.status_code == 200, expired.text
    assert expired.json()["status"] == "expired"
    assert (
        list((await db_session.execute(select(Process.__table__).order_by(Process.id))).mappings()) == business_before
    )
    await db_session.refresh(approval)
    assert approval.resolved_by_id == test_user_risk_manager.id
    locks = list(
        (
            await db_session.scalars(
                select(GovernedMutationImpactLock)
                .join(GovernedMutationProposal)
                .where(GovernedMutationProposal.approval_request_id == approval_id)
            )
        ).all()
    )
    assert locks and all(lock.released_at is not None and lock.release_reason == "expired" for lock in locks)
    audits = list(
        (
            await db_session.scalars(
                select(ActivityLog).where(
                    ActivityLog.entity_type == ActivityEntityType.APPROVAL,
                    ActivityLog.entity_id == approval_id,
                    ActivityLog.action == ActivityAction.STATUS_CHANGE,
                )
            )
        ).all()
    )
    events = list(
        (
            await db_session.scalars(
                select(OutboxEvent).where(
                    OutboxEvent.aggregate_type == "approval_request",
                    OutboxEvent.aggregate_id == approval_id,
                    OutboxEvent.event_type == "approval.request_expired",
                )
            )
        ).all()
    )
    assert len(audits) == len(events) == 1


@pytest.mark.parametrize("snapshot", ["cro", "not_cro", [], [1, "cro"]])
def test_snapshot_role_rule_does_not_accept_malformed_sequence(snapshot):
    from app.services._governed_mutations.composite_policy import (
        role_visible_in_snapshot,
    )

    assert not role_visible_in_snapshot("cro", snapshot)


def test_family_role_predicates_delegate_to_one_snapshot_membership_owner():
    import ast
    import inspect

    from app.services import approval_scenario_policy
    from app.services._governed_mutations import (
        fixed_accountability_policy,
        fixed_asset_policy,
        fixed_vendor_policy,
    )

    for predicate in (
        approval_scenario_policy.can_resolve_process_approval,
        fixed_asset_policy.is_live_eligible_asset_resolver,
        fixed_vendor_policy.is_live_eligible_vendor_resolver,
        fixed_accountability_policy.is_live_eligible_accountability_resolver,
    ):
        tree = ast.parse(inspect.getsource(predicate))
        calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)]
        assert (
            sum(isinstance(node.func, ast.Name) and node.func.id == "role_visible_in_snapshot" for node in calls) == 1
        )


@pytest.mark.asyncio
async def test_asset_vendor_link_visibility_uses_both_actual_policies(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
):
    policies = [
        ApprovalScenario(
            key=key,
            display_name=key,
            description=key,
            requires_approval=True,
            approver_roles=["risk_manager", "cro"],
        )
        for key in ("protected_asset_edit", "protected_vendor_edit")
    ]
    outsider = User(
        name="Linked composite CRO",
        email="linked-composite-cro@test.local",
        role_id=test_user_cro.role_id,
        department_id=test_user_cro.department_id,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    asset = Asset(
        name="Composite dependency Asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="critical",
    )
    vendor = Vendor(
        name="Composite dependency Vendor",
        process="Operations",
        outsourcing_owner_user_id=test_user_cro.id,
        department_id=test_user_cro.department_id,
        replaceability="not_substitutable",
    )
    # Ordinary resource read permission is separate from governed diff access.
    permission = Permission(resource="assets", action="read", description="Read Assets")
    db_session.add(permission)
    await db_session.flush()
    for user in (test_user_cro, test_user_risk_manager):
        role_permission = RolePermission(role_id=user.role_id, permission_id=permission.id)
        role_permission.permission = permission
        db_session.add(role_permission)
        user.role.permissions.append(role_permission)
    db_session.add_all([*policies, outsider, asset, vendor])
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/assets/{asset.id}/vendor-links",
            json={
                "vendor_id": vendor.id,
                "ict_service_code": "S02",
                "request_reason": "Independent review of both protected resources",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(GovernedMutationProposal.approval_request_id == approval_id)
    )
    assert set(proposal.proposed_changes["triggered_scenarios"]) == {
        "protected_asset_edit",
        "protected_vendor_edit",
    }
    policies[1].approver_roles = ["risk_manager"]
    await db_session.commit()
    for actor, visible in ((outsider, False), (test_user_risk_manager, True)):
        notifications = await _notification(db_session, actor, approval_id)
        before = await _unchanged_business_and_decisions(db_session)
        actual = await _surface_visibility(client_factory, actor, approval_id, notifications)
        assert await _unchanged_business_and_decisions(db_session) == before
        assert actual == _expected_visibility(visible)
        await _assert_notification_read_state(db_session, notifications, visible=visible)
        async with client_factory(user=actor) as reader:
            detail = await reader.get(f"/api/v1/assets/{asset.id}")
        assert detail.status_code == 200, detail.text
        pending = detail.json()["pending_change"]
        assert pending["capabilities"]["can_view_diff"] is visible
        assert pending["approval_id"] == (approval_id if visible else None)
