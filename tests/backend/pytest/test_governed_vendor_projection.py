"""Approval projection and delivery contracts for governed Vendor mutations."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    GovernedMutationProposal,
    Notification,
    Role,
    User,
)
from app.models.notification import NotificationType
from app.models.user import AccessScope
from app.services._governed_mutations.vendor_identity import is_vendor_governed_kind
from app.services._notification_approval_helpers import (
    eligible_approval_notification_recipients,
)
from app.services.notification_service import NotificationService
from app.services.outbox.handlers import approvals as approval_handlers
from app.services.outbox.payloads import (
    ApprovalRequestCancelledPayload,
    ApprovalRequestCreatedPayload,
    ApprovalRequestExpiredPayload,
    ApprovalRequestResolvedPayload,
)


async def _scenario(db: AsyncSession, *, enabled: bool = True) -> None:
    db.add(
        ApprovalScenario(
            key="protected_vendor_edit",
            display_name="Protected Vendor mutations",
            description="Independent approval for protected Vendor mutations",
            requires_approval=enabled,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db.commit()


def _payload(owner: User, **extra: object) -> dict[str, object]:
    return {
        "name": "Governed Vendor",
        "process": "Operations",
        "outsourcing_owner_user_id": owner.id,
        "department_id": owner.department_id,
        "replaceability": "not_substitutable",
        "request_reason": "Independent review for protected Vendor",
        **extra,
    }


@pytest.mark.parametrize(
    "kind",
    [
        "vendor.link.asset.add",
        "vendor.link.asset.remove",
        "vendor.link.process.add",
        "vendor.link.process.remove",
    ],
)
def test_vendor_identity_excludes_relationships_owned_by_asset_and_process(
    kind: str,
) -> None:
    assert is_vendor_governed_kind(kind) is False


@pytest.mark.asyncio
async def test_vendor_approval_queue_surfaces_cover_requester_resolver_count_and_filter(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/vendors",
            json=_payload(test_user_cro, name="Queue-visible Vendor"),
        )
        approval_id = submitted.json()["approval_id"]
        requester_pending = await requester.get(
            "/api/v1/approvals?status=pending&my_requests=true&resource_type=vendor"
        )
        requester_history = await requester.get(
            "/api/v1/approvals?my_requests=true&resource_type=vendor"
        )

    async with client_factory(user=test_user_risk_manager) as resolver:
        resolver_pending = await resolver.get(
            "/api/v1/approvals?status=pending&resource_type=vendor"
        )
        resolver_work = await resolver.get("/api/v1/approvals/my-approvals")
        pending_count = await resolver.get("/api/v1/approvals/pending/count")

    for response in (
        requester_pending,
        requester_history,
        resolver_pending,
        resolver_work,
        pending_count,
    ):
        assert response.status_code == 200, response.text
    assert requester_pending.json()["total"] == 1
    assert [item["id"] for item in requester_pending.json()["items"]] == [approval_id]
    assert [item["id"] for item in requester_history.json()["items"]] == [approval_id]
    assert [item["id"] for item in resolver_pending.json()["items"]] == [approval_id]
    assert [item["id"] for item in resolver_work.json()["items"]] == [approval_id]
    assert pending_count.json() == {"count": 1}
    resolver_item = resolver_pending.json()["items"][0]
    assert resolver_item["resource_type"] == "vendor"
    assert resolver_item["resource_name"] == "Queue-visible Vendor"
    assert resolver_item["capabilities"]["can_view_pending_changes"] is True
    assert resolver_item["governed_mutation"]["mutation_kind"] == "vendor.create"

    async with client_factory(user=test_user_risk_manager) as resolver:
        approved = await resolver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approve queue-visible Vendor"},
        )
        resolver_history = await resolver.get(
            "/api/v1/approvals?status=approved&resource_type=vendor"
        )
    async with client_factory(user=test_user_cro) as requester:
        terminal_requester_history = await requester.get(
            "/api/v1/approvals?my_requests=true&resource_type=vendor"
        )
    assert approved.status_code == 200, approved.text
    assert [item["id"] for item in resolver_history.json()["items"]] == [approval_id]
    assert [
        item["id"] for item in terminal_requester_history.json()["items"]
    ] == [approval_id]
    assert terminal_requester_history.json()["items"][0]["status"] == "approved"


@pytest.mark.asyncio
async def test_vendor_collection_marks_only_the_vendor_with_a_valid_active_change_as_pending(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    assert test_user_risk_manager.id != test_user_cro.id
    await _scenario(db_session, enabled=False)
    pending_payload = _payload(test_user_cro, name="Pending collection Vendor")
    unchanged_payload = _payload(test_user_cro, name="Unchanged collection Vendor")
    pending_payload.pop("request_reason")
    unchanged_payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        pending_vendor = await requester.post("/api/v1/vendors", json=pending_payload)
        unchanged_vendor = await requester.post("/api/v1/vendors", json=unchanged_payload)
    assert pending_vendor.status_code == 201, pending_vendor.text
    assert unchanged_vendor.status_code == 201, unchanged_vendor.text

    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{pending_vendor.json()['id']}",
            json={
                "description": "Pending independently reviewed description",
                "request_reason": "Show the active governed lock in the collection",
            },
        )
        collection = await requester.get("/api/v1/vendors?limit=100")

    assert submitted.status_code == 202, submitted.text
    assert collection.status_code == 200, collection.text
    items = {item["id"]: item for item in collection.json()["items"]}
    pending_capabilities = items[pending_vendor.json()["id"]]["capabilities"]
    for capability in (
        "can_update",
        "can_manage_accountability",
        "can_archive",
        "can_create_linked_risk",
        "can_create_linked_control",
        "can_create_linked_kri",
        "can_link_risk",
        "can_link_control",
        "can_link_kri",
        "can_manage_contracts",
        "can_manage_sub_outsourcing",
        "can_manage_asset_links",
        "can_manage_process_links",
    ):
        assert pending_capabilities[capability] is False
    assert pending_capabilities["has_pending_change"] is True
    assert pending_capabilities["business_edit_blocked"] is True
    assert (
        items[unchanged_vendor.json()["id"]]["capabilities"]["has_pending_change"]
        is False
    )


@pytest.mark.asyncio
async def test_live_role_change_does_not_grant_a_cro_vendor_approval_access(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_role_cro,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.approver_roles = ["risk_manager"]
    requester = User(
        name="Snapshot role requester",
        email="snapshot-role-requester@test.com",
        department_id=test_department.id,
        role_id=test_role_cro.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(requester)
    await db_session.commit()

    async with client_factory(user=requester) as requester_client:
        submitted = await requester_client.post(
            "/api/v1/vendors",
            json=_payload(requester, name="Snapshot-protected Vendor"),
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]

    scenario.approver_roles = ["cro"]
    await db_session.commit()

    async with client_factory(user=test_user_cro) as newly_live_cro:
        queue = await newly_live_cro.get(
            "/api/v1/approvals?status=pending&resource_type=vendor"
        )
        work = await newly_live_cro.get("/api/v1/approvals/my-approvals")
        count = await newly_live_cro.get("/api/v1/approvals/pending/count")
        detail = await newly_live_cro.get(f"/api/v1/approvals/{approval_id}")
        resolution = await newly_live_cro.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "A live role change must not grant authority"},
        )

    assert queue.status_code == 200, queue.text
    assert queue.json()["total"] == 0
    assert work.status_code == 200, work.text
    assert work.json()["total"] == 0
    assert count.status_code == 200, count.text
    assert count.json() == {"count": 0}
    assert detail.status_code == 403
    assert resolution.status_code == 403
    approval = await db_session.get(ApprovalRequest, approval_id)
    assert approval is not None
    assert approval.status == ApprovalStatus.PENDING


@pytest.mark.asyncio
async def test_vendor_notification_visibility_has_requester_resolver_and_read_parity(
    client_factory,
    db_session: AsyncSession,
    test_department,
    test_role_cro: Role,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.approver_roles = ["risk_manager"]
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted_create = await requester.post(
            "/api/v1/vendors",
            json=_payload(test_user_cro, name="Notification-visible Vendor create"),
        )
    assert submitted_create.status_code == 202, submitted_create.text
    create_approval_id = submitted_create.json()["approval_id"]
    create_approval = await db_session.get(ApprovalRequest, create_approval_id)
    create_proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == create_approval_id
        )
    )
    assert create_approval is not None
    assert create_proposal is not None
    assert "legal_name" not in create_proposal.before_snapshot
    assert create_proposal.after_snapshot["legal_name"] is None
    assert create_approval.pending_changes["legal_name"] == {
        "old": None,
        "new": None,
    }
    create_notifications: dict[int, Notification] = {}
    for user, title in (
        (test_user_cro, "Requester Vendor create"),
        (test_user_risk_manager, "Resolver Vendor create"),
    ):
        notification = await NotificationService.create_notification(
            db=db_session,
            user_id=user.id,
            notification_type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
            title=title,
            message="Correlated Vendor create approval visibility",
            resource_type="approval",
            resource_id=create_approval_id,
        )
        assert notification is not None
        create_notifications[user.id] = notification
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        requester_create_page = await requester.get("/api/v1/notifications")
        requester_create_count = await requester.get(
            "/api/v1/notifications/unread/count"
        )
        requester_create_read = await requester.post(
            f"/api/v1/notifications/{create_notifications[test_user_cro.id].id}/read"
        )
    assert requester_create_page.json()["total"] == 1
    assert requester_create_count.json() == {"count": 1}
    assert requester_create_read.status_code == 200, requester_create_read.text
    assert requester_create_read.json() == {"unread_count": 0}

    async with client_factory(user=test_user_risk_manager) as resolver:
        resolver_create_page = await resolver.get("/api/v1/notifications")
        resolver_create_count = await resolver.get(
            "/api/v1/notifications/unread/count"
        )
        resolver_create_read_all = await resolver.post(
            "/api/v1/notifications/read-all"
        )
        resolver_create_after = await resolver.get(
            "/api/v1/notifications/unread/count"
        )
    assert resolver_create_page.json()["total"] == 1
    assert resolver_create_count.json() == {"count": 1}
    assert resolver_create_read_all.status_code == 204, resolver_create_read_all.text
    assert resolver_create_after.json() == {"count": 0}

    await db_session.execute(
        update(Notification)
        .where(Notification.id == create_notifications[test_user_cro.id].id)
        .values(is_read=False)
    )
    await db_session.execute(
        update(ApprovalRequest)
        .where(ApprovalRequest.id == create_approval_id)
        .values(resource_name="   ")
    )
    if db_session.bind.dialect.name == "postgresql":
        await db_session.execute(text("SET LOCAL session_replication_role = replica"))
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == create_proposal.id)
        .values(primary_resource_name="   ")
    )
    if db_session.bind.dialect.name == "postgresql":
        await db_session.execute(text("SET LOCAL session_replication_role = origin"))
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        blank_name_page = await requester.get("/api/v1/notifications")
        blank_name_count = await requester.get(
            "/api/v1/notifications/unread/count"
        )
        blank_name_read = await requester.post(
            f"/api/v1/notifications/{create_notifications[test_user_cro.id].id}/read"
        )
        blank_name_read_all = await requester.post("/api/v1/notifications/read-all")
    assert blank_name_page.json()["total"] == 0
    assert blank_name_count.json() == {"count": 0}
    assert blank_name_read.status_code == 404, blank_name_read.text
    assert blank_name_read_all.status_code == 204, blank_name_read_all.text

    for controlled_whitespace in ("\t", "\n", "\r"):
        await db_session.execute(
            update(Notification)
            .where(Notification.id == create_notifications[test_user_cro.id].id)
            .values(is_read=False)
        )
        await db_session.execute(
            update(ApprovalRequest)
            .where(ApprovalRequest.id == create_approval_id)
            .values(resource_name=controlled_whitespace)
        )
        if db_session.bind.dialect.name == "postgresql":
            await db_session.execute(
                text("SET LOCAL session_replication_role = replica")
            )
        await db_session.execute(
            update(GovernedMutationProposal)
            .where(GovernedMutationProposal.id == create_proposal.id)
            .values(primary_resource_name=controlled_whitespace)
        )
        if db_session.bind.dialect.name == "postgresql":
            await db_session.execute(
                text("SET LOCAL session_replication_role = origin")
            )
        await db_session.commit()

        async with client_factory(user=test_user_cro) as requester:
            controlled_blank_page = await requester.get("/api/v1/notifications")
            controlled_blank_count = await requester.get(
                "/api/v1/notifications/unread/count"
            )
            controlled_blank_read = await requester.post(
                f"/api/v1/notifications/"
                f"{create_notifications[test_user_cro.id].id}/read"
            )
            controlled_blank_read_all = await requester.post(
                "/api/v1/notifications/read-all"
            )
        assert controlled_blank_page.json()["total"] == 0
        assert controlled_blank_count.json() == {"count": 0}
        assert controlled_blank_read.status_code == 404, controlled_blank_read.text
        assert (
            controlled_blank_read_all.status_code == 204
        ), controlled_blank_read_all.text

    await db_session.execute(
        update(ApprovalRequest)
        .where(ApprovalRequest.id == create_approval_id)
        .values(resource_name="Notification-visible Vendor create")
    )
    if db_session.bind.dialect.name == "postgresql":
        await db_session.execute(text("SET LOCAL session_replication_role = replica"))
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == create_proposal.id)
        .values(primary_resource_name="Notification-visible Vendor create")
    )
    if db_session.bind.dialect.name == "postgresql":
        await db_session.execute(text("SET LOCAL session_replication_role = origin"))
    await db_session.execute(
        delete(Notification).where(
            Notification.id.in_(
                [notification.id for notification in create_notifications.values()]
            )
        )
    )
    scenario.requires_approval = False
    await db_session.commit()

    direct_payload = _payload(
        test_user_cro,
        name="Notification-visible Vendor",
    )
    direct_payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=direct_payload)
    assert created.status_code == 201, created.text

    scenario.requires_approval = True
    excluded_cro = User(
        name="Excluded Vendor notification CRO",
        email="excluded-vendor-notification-cro@test.com",
        department_id=test_department.id,
        role_id=test_role_cro.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(excluded_cro)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "description": "Independently reviewed notification change",
                "request_reason": "Exercise notification SQL parity",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    notifications: dict[int, Notification] = {}
    for user, title in (
        (test_user_cro, "Requester Vendor update"),
        (test_user_risk_manager, "Resolver Vendor action"),
        (excluded_cro, "Excluded Vendor action"),
    ):
        notification = await NotificationService.create_notification(
            db=db_session,
            user_id=user.id,
            notification_type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
            title=title,
            message="Correlated Vendor approval visibility",
            resource_type="approval",
            resource_id=approval_id,
        )
        assert notification is not None
        notifications[user.id] = notification
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        requester_page = await requester.get("/api/v1/notifications")
        requester_count = await requester.get("/api/v1/notifications/unread/count")
        requester_read = await requester.post(
            f"/api/v1/notifications/{notifications[test_user_cro.id].id}/read"
        )
    assert requester_page.json()["total"] == 1
    assert requester_count.json() == {"count": 1}
    assert requester_read.status_code == 200, requester_read.text
    assert requester_read.json() == {"unread_count": 0}

    async with client_factory(user=test_user_risk_manager) as resolver:
        resolver_page = await resolver.get("/api/v1/notifications")
        resolver_count = await resolver.get("/api/v1/notifications/unread/count")
        resolver_read_all = await resolver.post("/api/v1/notifications/read-all")
        resolver_after = await resolver.get("/api/v1/notifications/unread/count")
    assert resolver_page.json()["total"] == 1
    assert resolver_count.json() == {"count": 1}
    assert resolver_read_all.status_code == 204, resolver_read_all.text
    assert resolver_after.json() == {"count": 0}

    async with client_factory(user=excluded_cro) as excluded:
        excluded_page = await excluded.get("/api/v1/notifications")
        excluded_count = await excluded.get("/api/v1/notifications/unread/count")
        excluded_read = await excluded.post(
            f"/api/v1/notifications/{notifications[excluded_cro.id].id}/read"
        )
        excluded_read_all = await excluded.post("/api/v1/notifications/read-all")
    assert excluded_page.json()["total"] == 0
    assert excluded_count.json() == {"count": 0}
    assert excluded_read.status_code == 404, excluded_read.text
    assert excluded_read_all.status_code == 204, excluded_read_all.text

    malformed_notification = await NotificationService.create_notification(
        db=db_session,
        user_id=test_user_cro.id,
        notification_type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
        title="Malformed Vendor approval",
        message="A malformed proposal must fail closed",
        resource_type="approval",
        resource_id=approval_id,
    )
    assert malformed_notification is not None
    await db_session.commit()
    approval = await db_session.get(ApprovalRequest, approval_id)
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert approval is not None
    assert proposal is not None
    original_pending = approval.pending_changes
    original_proposal_values = {
        "before_snapshot": proposal.before_snapshot,
        "after_snapshot": proposal.after_snapshot,
        "base_versions": proposal.base_versions,
        "derived_impact_snapshot": proposal.derived_impact_snapshot,
        "impacted_resources_snapshot": proposal.impacted_resources_snapshot,
        "mutation_kind": proposal.mutation_kind,
    }
    tamper_cases = (
        (
            ApprovalRequest,
            {
                "pending_changes": {
                    "description": {"old": None, "new": "UNREVIEWED"}
                }
            },
        ),
        (
            GovernedMutationProposal,
            {
                "before_snapshot": {},
                "after_snapshot": {},
                "base_versions": {"vendor": 999},
                "derived_impact_snapshot": {
                    "before": {"tier": "critical"},
                    "after": {"tier": "forged"},
                },
                "impacted_resources_snapshot": [],
                "mutation_kind": "vendor.link.risk.add",
            },
        ),
    )
    for model, tampered_values in tamper_cases:
        if (
            db_session.bind.dialect.name == "postgresql"
            and model is GovernedMutationProposal
        ):
            await db_session.execute(
                text("SET LOCAL session_replication_role = replica")
            )
        target_id = approval_id if model is ApprovalRequest else proposal.id
        await db_session.execute(
            update(model)
            .where(model.id == target_id)
            .values(**tampered_values)
        )
        if (
            db_session.bind.dialect.name == "postgresql"
            and model is GovernedMutationProposal
        ):
            await db_session.execute(
                text("SET LOCAL session_replication_role = origin")
            )
        await db_session.commit()
        async with client_factory(user=test_user_cro) as requester:
            malformed_page = await requester.get("/api/v1/notifications")
            malformed_count = await requester.get(
                "/api/v1/notifications/unread/count"
            )
            malformed_read = await requester.post(
                f"/api/v1/notifications/{malformed_notification.id}/read"
            )
            malformed_read_all = await requester.post(
                "/api/v1/notifications/read-all"
            )
        assert malformed_page.json()["total"] == 0
        assert malformed_count.json() == {"count": 0}
        assert malformed_read.status_code == 404, malformed_read.text
        assert malformed_read_all.status_code == 204, malformed_read_all.text
        restored_values = (
            {"pending_changes": original_pending}
            if model is ApprovalRequest
            else original_proposal_values
        )
        if (
            db_session.bind.dialect.name == "postgresql"
            and model is GovernedMutationProposal
        ):
            await db_session.execute(
                text("SET LOCAL session_replication_role = replica")
            )
        await db_session.execute(
            update(model)
            .where(model.id == target_id)
            .values(**restored_values)
        )
        if (
            db_session.bind.dialect.name == "postgresql"
            and model is GovernedMutationProposal
        ):
            await db_session.execute(
                text("SET LOCAL session_replication_role = origin")
            )
        await db_session.commit()


@pytest.mark.asyncio
async def test_vendor_detail_hides_a_malformed_proposal_behind_an_active_lock(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    assert test_user_risk_manager.id != test_user_cro.id
    await _scenario(db_session, enabled=False)
    payload = _payload(test_user_cro, name="Malformed pending detail Vendor")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=payload)
    assert created.status_code == 201, created.text

    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/vendors/{created.json()['id']}",
            json={
                "description": "UNTRUSTED_MALFORMED_VENDOR_SNAPSHOT",
                "request_reason": "UNTRUSTED_MALFORMED_VENDOR_REASON",
            },
        )
    assert submitted.status_code == 202, submitted.text
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
        .values(proposal_version=2)
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        detail = await requester.get(f"/api/v1/vendors/{created.json()['id']}")

    assert detail.status_code == 200, detail.text
    assert detail.json()["pending_change"] is None
    assert detail.json()["capabilities"]["has_pending_change"] is False
    assert detail.json()["capabilities"]["can_cancel_pending_change"] is False
    assert "UNTRUSTED_MALFORMED_VENDOR_SNAPSHOT" not in detail.text
    assert "UNTRUSTED_MALFORMED_VENDOR_REASON" not in detail.text


@pytest.mark.asyncio
async def test_vendor_relationship_projection_uses_permitted_target_label(
    client_factory,
    db_session: AsyncSession,
    test_risk,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session, enabled=False)
    direct = _payload(test_user_cro, name="Relationship Vendor")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/vendors", json=direct)
    assert created.status_code == 201, created.text
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_vendor_edit"
        )
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/vendors/{created.json()['id']}/linked-risks",
            json={
                "risk_id": test_risk.id,
                "request_reason": "Review Vendor Risk relationship",
            },
        )
        requester_detail = await requester.get(
            f"/api/v1/approvals/{submitted.json()['approval_id']}"
        )
    async with client_factory(user=test_user_risk_manager) as resolver:
        resolver_detail = await resolver.get(
            f"/api/v1/approvals/{submitted.json()['approval_id']}"
        )

    for detail in (requester_detail, resolver_detail):
        assert detail.status_code == 200, detail.text
        governed = detail.json()["governed_mutation"]
        assert governed["relationship_change"] == {
            "target_resource_type": "risk",
            "target_resource_name": test_risk.name,
            "action": "add",
            "before": {
                "linked_risk": False,
                "relationship_target": None,
            },
            "after": {
                "linked_risk": True,
                "relationship_target": "R-TEST-001: Test Risk",
            },
        }


@pytest.mark.asyncio
async def test_vendor_outbox_routes_submission_and_every_terminal_event(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert test_user_risk_manager.id != test_user_cro.id
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/vendors",
            json=_payload(test_user_cro, name="Notification Vendor"),
        )
    approval = await db_session.get(ApprovalRequest, submitted.json()["approval_id"])
    assert approval is not None
    approval = (
        await db_session.execute(
            select(ApprovalRequest).where(ApprovalRequest.id == approval.id)
        )
    ).scalar_one()
    candidates, skipped = await eligible_approval_notification_recipients(
        db_session,
        approval,
        exclude_user_id=test_user_cro.id,
    )
    assert {candidate.id for candidate in candidates} == {test_user_risk_manager.id}
    assert skipped == {"excluded_actor": 1, "hidden_resource": 0}
    action_notifications = await NotificationService.notify_governed_action_required(
        db_session,
        approval,
        event="submitted",
    )
    requester_notification = await NotificationService.notify_governed_request_update(
        db_session,
        approval,
        outcome="approved",
    )
    assert [notification.title for notification in action_notifications] == [
        "Protected Vendor change requires review"
    ]
    assert requester_notification is not None
    assert requester_notification.title == "Protected Vendor request approved"

    monkeypatch.setattr(
        approval_handlers,
        "_load_approval",
        AsyncMock(return_value=approval),
    )
    notify_action = AsyncMock(return_value=[])
    notify_update = AsyncMock(return_value=None)
    monkeypatch.setattr(
        approval_handlers.NotificationService,
        "notify_governed_action_required",
        notify_action,
    )
    monkeypatch.setattr(
        approval_handlers.NotificationService,
        "notify_governed_request_update",
        notify_update,
    )

    await approval_handlers.handle_approval_request_created(
        db_session,
        ApprovalRequestCreatedPayload(approval_id=approval.id),
    )
    approval.status = ApprovalStatus.APPROVED
    await approval_handlers.handle_approval_request_resolved(
        db_session,
        ApprovalRequestResolvedPayload(approval_id=approval.id, approved=True),
    )
    approval.status = ApprovalStatus.REJECTED
    await approval_handlers.handle_approval_request_resolved(
        db_session,
        ApprovalRequestResolvedPayload(approval_id=approval.id, approved=False),
    )
    approval.status = ApprovalStatus.CANCELLED
    await approval_handlers.handle_approval_request_cancelled(
        db_session,
        ApprovalRequestCancelledPayload(
            approval_id=approval.id,
            cancelled_by_user_id=test_user_cro.id,
        ),
    )
    approval.status = ApprovalStatus.EXPIRED
    await approval_handlers.handle_approval_request_expired(
        db_session,
        ApprovalRequestExpiredPayload(approval_id=approval.id),
    )

    assert [call.kwargs for call in notify_action.await_args_list] == [
        {"event": "submitted", "strict_errors": True},
        {"event": "cancelled", "strict_errors": True},
        {"event": "expired", "strict_errors": True},
    ]
    assert [call.kwargs for call in notify_update.await_args_list] == [
        {"outcome": "approved", "strict_errors": True},
        {"outcome": "rejected", "strict_errors": True},
        {"outcome": "cancelled", "strict_errors": True},
        {"outcome": "expired", "strict_errors": True},
    ]
