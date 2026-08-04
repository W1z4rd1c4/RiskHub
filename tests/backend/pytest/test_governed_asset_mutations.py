"""Protected Asset governed-mutation behavior for ICT-GOV #86."""

from __future__ import annotations

import asyncio
import inspect
import json
from copy import deepcopy
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm.attributes import set_committed_value

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Notification,
    OutboxEvent,
    Permission,
    Process,
    ProcessAssetLink,
    Risk,
    RiskAssetLink,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.notification import NotificationType
from app.models.user import AccessScope
from app.services._governed_mutations.asset_identity import (
    valid_asset_governed_envelope,
)
from app.services._governed_mutations.asset_resolution_policy import (
    load_live_asset_resolution_policy,
)
from app.services._governed_mutations.process_identity import (
    strict_governed_process_identity,
)
from app.services._governed_mutations.process_mutations import (
    strict_extended_process_identity,
)
from app.services.notification_service import NotificationService


async def _scenario(db: AsyncSession) -> None:
    db.add_all(
        [
            ApprovalScenario(
                key="protected_asset_edit",
                display_name="Protected Asset mutations",
                description="Independent approval for protected Asset mutations",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="protected_vendor_edit",
                display_name="Protected Vendor mutations",
                description="Independent approval for protected Vendor mutations",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
            ApprovalScenario(
                key="accountability_reassignment",
                display_name="Accountability reassignments",
                description="Independent approval for accountability reassignments",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            ),
        ]
    )
    await db.commit()


async def _process_scenario(db: AsyncSession) -> None:
    db.add(
        ApprovalScenario(
            key="protected_process_edit",
            display_name="Protected Process mutations",
            description="Independent approval for CIF Process mutations",
            requires_approval=True,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db.commit()


def _critical_payload(owner: User, **extra: object) -> dict[str, object]:
    assert owner.department_id is not None
    return {
        "name": "Protected critical Asset",
        "business_owner_user_id": owner.id,
        "ict_owner_user_id": owner.id,
        "owning_department_id": owner.department_id,
        "preliminary_criticality": "critical",
        "request_reason": "Independent review for protected Asset",
        **extra,
    }


def _replay_identifier_keys(value: object) -> set[str]:
    if isinstance(value, dict):
        return {
            key for key in value if key == "id" or key.endswith("_id")
        } | set().union(*(_replay_identifier_keys(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(_replay_identifier_keys(item) for item in value))
    return set()


def _deep_json_envelope(depth: int) -> dict[str, object]:
    value: object = {"business_owner_user_id": 999_999_999}
    for _ in range(depth):
        value = {"nested": [value]}
    return {"before": {}, "after": value}


def test_asset_resolution_policy_declares_one_canonical_lock_plan_with_scenario_last() -> (
    None
):
    source = inspect.getsource(load_live_asset_resolution_policy)
    ordered_markers = [
        "_lock_asset_resolution_actors",
        "_lock_asset_departments_resources_and_references",
        "load_ict_workbook_parameter_set_for_update",
        "load_fixed_asset_scenario_for_update",
    ]
    positions = [source.index(marker) for marker in ordered_markers]
    assert positions == sorted(positions)
    assert source.index("valid_asset_governed_envelope") < source.index(
        "_lock_asset_resolution_actors"
    )


def test_asset_relationship_intake_owns_sorted_unique_asset_row_locks() -> None:
    from app.services._governed_mutations import asset_mutations

    source = inspect.getsource(asset_mutations.submit_asset_link_mutation_if_required)
    lock_position = source.index("_lock_impacted_assets_for_submission")
    assert lock_position < source.index("assert_no_pending_asset_mutation")
    helper_source = inspect.getsource(
        asset_mutations._lock_impacted_assets_for_submission
    )
    assert ".order_by(Asset.id)" in helper_source
    assert ".with_for_update()" in helper_source


def test_asset_asset_link_endpoint_has_no_single_asset_prelock() -> None:
    from app.services._ict_register_lifecycle import asset_links

    for operation in (
        asset_links.add_asset_asset_link,
        asset_links.remove_asset_asset_link,
    ):
        source = inspect.getsource(operation)
        sorted_lock = source.index("_lock_asset_link_targets")
        assert "assert_asset_ordinary_mutation_allowed" not in source[:sorted_lock]
        assert "_require_asset_link_access" not in source[:sorted_lock]


def test_asset_governed_kind_is_an_exact_allowlist() -> None:
    from app.services._governed_mutations.asset_identity import (
        ASSET_RELATIONSHIP_KINDS,
        is_asset_governed_kind,
    )

    supported = {
        "asset.create",
        "asset.edit",
        "asset.archive",
        *ASSET_RELATIONSHIP_KINDS,
    }
    assert len(supported) == 9
    assert all(is_asset_governed_kind(kind) for kind in supported)
    assert not is_asset_governed_kind("composite.process_asset.arbitrary")
    assert not is_asset_governed_kind("asset.link.asset.update")


def test_asset_archive_intake_owns_asset_row_lock_before_visibility_and_derivation() -> (
    None
):
    from app.services._governed_mutations import asset_mutations

    source = inspect.getsource(asset_mutations.submit_asset_archive_if_required)
    lock_position = source.index("_lock_impacted_assets_for_submission")
    assert lock_position < source.index("assert_no_pending_asset_mutation")
    assert lock_position < source.index("_existing_asset_impacts")


def test_composite_process_asset_intake_uses_policy_role_intersection() -> None:
    from app.services._governed_mutations import process_mutations, process_updates

    for function in (
        process_mutations.submit_process_archive_if_required,
        process_mutations.submit_process_relationship_mutation,
        process_updates.submit_process_mutation_if_required,
    ):
        source = inspect.getsource(function)
        assert "effective_triggered_policy_roles" in source
        assert "approval roles are inconsistent" not in source


def test_asset_asset_link_service_owns_complete_sorted_lock_set() -> None:
    from app.api.v1.endpoints.assets import links as endpoint_links
    from app.services._ict_register_lifecycle import asset_links

    endpoint_source = inspect.getsource(endpoint_links.create_asset_asset_link)
    endpoint_source += inspect.getsource(endpoint_links.delete_asset_asset_link)
    assert "with_for_update" not in endpoint_source
    for operation in (
        asset_links.add_asset_asset_link,
        asset_links.remove_asset_asset_link,
    ):
        assert "_lock_asset_link_targets" in inspect.getsource(operation)


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["approved", "rejected", "cancelled", "expired"])
async def test_asset_requester_outcome_notifications_are_semantic_visible_and_preference_aware(
    outcome: str,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    assert test_user_risk_manager.id != test_user_cro.id
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets",
            json=_critical_payload(
                test_user_cro,
                name=f"Asset requester outcome {outcome}",
            ),
        )
    assert submitted.status_code == 202, submitted.text
    approval = await db_session.get(ApprovalRequest, submitted.json()["approval_id"])
    assert approval is not None
    await db_session.refresh(approval, ["governed_mutation_proposal"])

    test_user_cro.notification_preferences = {
        "governed_approval_request_updates": False
    }
    await db_session.commit()
    assert (
        await NotificationService.notify_governed_request_update(
            db_session,
            approval,
            outcome=outcome,
        )
        is None
    )

    test_user_cro.notification_preferences = {"governed_approval_request_updates": True}
    await db_session.commit()
    notification = await NotificationService.notify_governed_request_update(
        db_session,
        approval,
        outcome=outcome,
    )
    await db_session.commit()
    assert notification is not None
    assert notification.title == f"Protected Asset request {outcome}"
    async with client_factory(user=test_user_cro) as requester:
        inbox = await requester.get("/api/v1/notifications")
    assert inbox.status_code == 200, inbox.text
    assert notification.id in {item["id"] for item in inbox.json()["items"]}


@pytest.mark.asyncio
async def test_asset_notification_visibility_accepts_null_resulting_criticality(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets",
            json=_critical_payload(
                test_user_cro,
                name="Null-criticality notification source",
            ),
        )
    assert submitted.status_code == 202, submitted.text

    source_approval = await db_session.get(
        ApprovalRequest, submitted.json()["approval_id"]
    )
    source = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == source_approval.id
        )
    )
    assert source_approval is not None and source is not None
    source_approval.status = ApprovalStatus.EXPIRED
    await db_session.commit()

    approval = ApprovalRequest(
        resource_type=source_approval.resource_type,
        resource_id=source_approval.resource_id,
        resource_name=source_approval.resource_name,
        action_type=source_approval.action_type,
        pending_changes=deepcopy(source_approval.pending_changes),
        scenario_key=source_approval.scenario_key,
        scenario_approver_roles=list(source_approval.scenario_approver_roles),
        requested_by_id=source_approval.requested_by_id,
        reason=source_approval.reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db_session.add(approval)
    await db_session.flush()
    derived = deepcopy(source.derived_impact_snapshot)
    derived["after"] = {"cif": "yes", "resulting_criticality": None}
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=source.proposal_version,
        schema_version=source.schema_version,
        approval_request_id=approval.id,
        mutation_kind=source.mutation_kind,
        primary_resource_type=source.primary_resource_type,
        primary_resource_id=source.primary_resource_id,
        primary_resource_name=source.primary_resource_name,
        scenario_snapshot=deepcopy(source.scenario_snapshot),
        base_versions=deepcopy(source.base_versions),
        before_snapshot=deepcopy(source.before_snapshot),
        after_snapshot=deepcopy(source.after_snapshot),
        derived_impact_snapshot=derived,
        proposed_changes=deepcopy(source.proposed_changes),
        impacted_resources_snapshot=deepcopy(source.impacted_resources_snapshot),
        requested_by_id=source.requested_by_id,
    )
    db_session.add(proposal)
    notification = Notification(
        user_id=test_user_cro.id,
        type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
        title="Protected Asset approval with null criticality",
        message="Canonical null derived criticality remains visible",
        resource_type="approval",
        resource_id=approval.id,
        is_read=False,
    )
    db_session.add(notification)
    await db_session.commit()
    await db_session.refresh(proposal, ["approval_request"])
    assert valid_asset_governed_envelope(proposal) is True

    async with client_factory(user=test_user_cro) as requester:
        inbox = await requester.get("/api/v1/notifications")
        unread = await requester.get("/api/v1/notifications/unread/count")
        read = await requester.post(f"/api/v1/notifications/{notification.id}/read")

    assert inbox.status_code == 200, inbox.text
    assert notification.id in {item["id"] for item in inbox.json()["items"]}
    assert unread.json() == {"count": 1}
    assert read.status_code == 200, read.text
    assert read.json() == {"unread_count": 0}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("field", "malformed"),
    [
        ("after_snapshot", None),
        ("base_versions", None),
        ("proposed_changes", None),
        ("derived_impact_snapshot", None),
        ("impacted_resources_snapshot", None),
        (
            "scenario_snapshot",
            {
                "key": "protected_asset_edit",
                "requires_approval": True,
                "approver_roles": [{}],
            },
        ),
        (
            "scenario_snapshot",
            {
                "key": "protected_asset_edit",
                "requires_approval": True,
                "approver_roles": [["risk_manager"]],
            },
        ),
    ],
)
async def test_asset_identity_validator_is_total_for_malformed_json_shapes(
    field: str,
    malformed: object,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets",
            json=_critical_payload(test_user_cro, name=f"Malformed identity {field}"),
        )
    assert submitted.status_code == 202, submitted.text
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
    )
    assert proposal is not None
    setattr(proposal, field, malformed)

    assert valid_asset_governed_envelope(proposal) is False


@pytest.mark.asyncio
async def test_asset_identity_add_path_guards_operation_before_get(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets",
            json=_critical_payload(test_user_cro, name="Malformed add identity"),
        )
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
    )
    assert proposal is not None
    proposal.mutation_kind = "asset.link.asset.add"
    proposal.proposed_changes = {"operation": []}

    assert valid_asset_governed_envelope(proposal) is False


@pytest.mark.asyncio
async def test_malformed_asset_identity_is_excluded_and_resolution_expires_safely(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets",
            json=_critical_payload(test_user_cro, name="Malformed queue Asset"),
        )
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == proposal.id)
        .values(after_snapshot=None)
    )
    malformed_notification = Notification(
        user_id=test_user_cro.id,
        type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
        title="Malformed Asset approval must stay hidden",
        message="Strict correlated SQL must reject this envelope",
        resource_type="approval",
        resource_id=approval_id,
    )
    db_session.add(malformed_notification)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        inbox = await requester.get("/api/v1/notifications")
    assert inbox.status_code == 200, inbox.text
    assert malformed_notification.id not in {
        item["id"] for item in inbox.json()["items"]
    }
    db_session.expunge_all()
    malformed_approval = await db_session.get(ApprovalRequest, approval_id)
    assert malformed_approval is not None
    await db_session.refresh(malformed_approval, ["governed_mutation_proposal"])
    notifications = await NotificationService.notify_governed_action_required(
        db_session,
        malformed_approval,
        event="submitted",
    )

    async with client_factory(user=test_user_risk_manager) as approver:
        queue = await approver.get("/api/v1/approvals?status=pending")
    async with client_factory(user=test_user_cro) as requester:
        detail = await requester.get(f"/api/v1/approvals/{approval_id}")
    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Malformed identity must expire"},
        )
    assert queue.status_code == 200, queue.text
    assert approval_id not in {item["id"] for item in queue.json()["items"]}
    assert notifications == []
    assert detail.status_code in {400, 403, 404}
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"


@pytest.mark.asyncio
async def test_sqlite_asset_edit_notification_rejects_mismatched_raw_snapshot_keys(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "sqlite":
        pytest.skip("SQLite JSON key-set semantics are authoritative here")
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    payload = _critical_payload(
        test_user_cro,
        name="SQLite mismatched raw edit keys",
        preliminary_criticality="low",
    )
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=payload)
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{created.json()['id']}",
            json={
                "preliminary_criticality": "critical",
                "request_reason": "Reject mismatched raw edit snapshots",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    corrupted = dict(proposal.proposed_changes)
    corrupted["before"] = {}
    db_session.expunge(proposal)
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.approval_request_id == approval_id)
        .values(proposed_changes=corrupted)
    )
    notification = Notification(
        user_id=test_user_cro.id,
        type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
        title="Malformed raw Asset edit",
        message="Must be hidden by exact SQL",
        resource_type="approval",
        resource_id=approval_id,
        is_read=False,
    )
    db_session.add(notification)
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        inbox = await requester.get("/api/v1/notifications")
        unread = await requester.get("/api/v1/notifications/unread/count")
        read = await requester.post(f"/api/v1/notifications/{notification.id}/read")
    assert inbox.status_code == 200, inbox.text
    assert notification.id not in {item["id"] for item in inbox.json()["items"]}
    assert unread.json() == {"count": 0}
    assert read.status_code == 404, read.text


@pytest.mark.postgres
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "corruption",
    [
        "impact_string_id",
        "impact_nonnumeric_id",
        "impact_oversized_id",
        "operation_string_id",
        "operation_bool_id",
        "operation_float_id",
        "proposal_uuid",
        "approver_roles",
    ],
)
async def test_postgres_notification_sql_rejects_noninteger_json_ids_without_aborting(
    corruption: str,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL JSON integer guards are authoritative")
    await _scenario(db_session)
    asset = Asset(
        name=f"Postgres JSON id guard {corruption}",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="critical",
    )
    risk = Risk(
        risk_id_code=f"R-JSON-{corruption}",
        name="Postgres malformed JSON identifier",
        process="Operations",
        description="Notification SQL must totalize malformed JSON",
        department_id=test_user_cro.department_id,
        owner_id=test_user_cro.id,
    )
    db_session.add_all([asset, risk])
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/risks/{risk.id}/asset-links",
            json={
                "asset_id": asset.id,
                "request_reason": "Create a valid relationship envelope to clone",
            },
        )
    assert submitted.status_code == 202, submitted.text
    source = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
    )
    source_approval = await db_session.get(
        ApprovalRequest, submitted.json()["approval_id"]
    )
    assert source is not None and source_approval is not None
    # Free the pending uniqueness slot; the source row is only a convenient
    # producer for one otherwise exact immutable JSON envelope.
    source_approval.status = ApprovalStatus.EXPIRED
    await db_session.commit()
    impacts = deepcopy(source.impacted_resources_snapshot)
    derived = deepcopy(source.derived_impact_snapshot)
    proposed = deepcopy(source.proposed_changes)
    base_versions = deepcopy(source.base_versions)
    if corruption.startswith("impact_"):
        malformed_id = {
            "impact_string_id": str(asset.id),
            "impact_nonnumeric_id": "not-a-number",
            "impact_oversized_id": "9" * 80,
        }[corruption]
        impacts[0]["resource_id"] = malformed_id
        derived["assets"][0]["resource_id"] = malformed_id
        base_versions = {f"asset:{malformed_id}": impacts[0]["base_governance_version"]}
    elif corruption.startswith("operation_"):
        proposed["operation"]["related_resource_id"] = {
            "operation_string_id": str(risk.id),
            "operation_bool_id": True,
            "operation_float_id": float(risk.id),
        }[corruption]
    scenario_snapshot = deepcopy(source.scenario_snapshot)
    if corruption == "approver_roles":
        scenario_snapshot["approver_roles"] = ["cro"]
    approval = ApprovalRequest(
        resource_type=source_approval.resource_type,
        resource_id=source_approval.resource_id,
        resource_name=source_approval.resource_name,
        action_type=source_approval.action_type,
        pending_changes=deepcopy(source_approval.pending_changes),
        scenario_key=source_approval.scenario_key,
        scenario_approver_roles=list(source_approval.scenario_approver_roles),
        requested_by_id=source_approval.requested_by_id,
        reason=source_approval.reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db_session.add(approval)
    await db_session.flush()
    corrupt = GovernedMutationProposal(
        proposal_id=(
            "not-a-canonical-uuid" if corruption == "proposal_uuid" else str(uuid4())
        ),
        proposal_version=source.proposal_version,
        schema_version=source.schema_version,
        approval_request_id=approval.id,
        mutation_kind=source.mutation_kind,
        primary_resource_type=source.primary_resource_type,
        primary_resource_id=source.primary_resource_id,
        primary_resource_name=source.primary_resource_name,
        scenario_snapshot=scenario_snapshot,
        base_versions=base_versions,
        before_snapshot=deepcopy(source.before_snapshot),
        after_snapshot=deepcopy(source.after_snapshot),
        derived_impact_snapshot=derived,
        proposed_changes=proposed,
        impacted_resources_snapshot=impacts,
        requested_by_id=source.requested_by_id,
    )
    db_session.add(corrupt)
    malformed_notification = Notification(
        user_id=test_user_cro.id,
        type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
        title="Malformed PostgreSQL JSON identifier",
        message="Must be hidden without a bigint cast error",
        resource_type="approval",
        resource_id=approval.id,
        is_read=False,
    )
    db_session.add(malformed_notification)
    await db_session.commit()
    if corruption.startswith("operation_"):
        await db_session.refresh(corrupt, ["approval_request"])
        assert valid_asset_governed_envelope(corrupt) is False
    async with client_factory(user=test_user_cro) as requester:
        inbox = await requester.get("/api/v1/notifications")
        unread = await requester.get("/api/v1/notifications/unread/count")
        read = await requester.post(
            f"/api/v1/notifications/{malformed_notification.id}/read"
        )
    assert inbox.status_code == 200, inbox.text
    assert unread.status_code == 200, unread.text
    assert malformed_notification.id not in {
        item["id"] for item in inbox.json()["items"]
    }
    assert read.status_code == 404, read.text


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_rowless_asset_creation_serializes_name_with_pending_resolution(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch: pytest.MonkeyPatch,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL advisory serialization is authoritative")
    await _scenario(db_session)
    duplicate_name = "Rowless concurrent Asset name"
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets",
            json=_critical_payload(test_user_cro, name=duplicate_name),
        )
    assert submitted.status_code == 202, submitted.text
    alternate_department = Department(
        name="Rowless ordinary creation department",
        code="ROWLESS-ORDINARY",
        is_active=True,
    )
    db_session.add(alternate_department)
    await db_session.commit()

    from app.services._governed_mutations import asset_mutations

    ordinary_holds_name_decision = asyncio.Event()
    release_ordinary = asyncio.Event()
    pause_ordinary = False
    original_creation_impact = asset_mutations._creation_impact

    async def paused_ordinary_impact(db, payload):
        impact = await original_creation_impact(db, payload)
        if pause_ordinary and payload.name == duplicate_name:
            ordinary_holds_name_decision.set()
            await release_ordinary.wait()
        return impact

    monkeypatch.setattr(asset_mutations, "_creation_impact", paused_ordinary_impact)
    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def independent_db_session():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            yield session

    ordinary_payload = _critical_payload(
        test_user_risk_manager,
        name=duplicate_name,
        preliminary_criticality="low",
    )
    ordinary_payload.pop("request_reason")
    ordinary_payload["owning_department_id"] = alternate_department.id
    pause_ordinary = True
    async with (
        client_factory(
            user=test_user_cro,
            db_override=independent_db_session,
            raise_app_exceptions=False,
        ) as ordinary_client,
        client_factory(
            user=test_user_risk_manager,
            db_override=independent_db_session,
            raise_app_exceptions=False,
        ) as resolver,
    ):
        creating = asyncio.create_task(
            ordinary_client.post("/api/v1/assets", json=ordinary_payload)
        )
        reached = asyncio.create_task(ordinary_holds_name_decision.wait())
        done, _ = await asyncio.wait(
            {creating, reached}, timeout=5, return_when=asyncio.FIRST_COMPLETED
        )
        assert reached in done, (
            creating.result().text if creating in done else "ordinary creation stalled"
        )
        resolving = asyncio.create_task(
            resolver.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
                json={"resolution_notes": "Serialize the rowless Asset name"},
            )
        )
        await asyncio.sleep(0.15)
        assert not resolving.done()
        release_ordinary.set()
        ordinary_response, resolved = await asyncio.wait_for(
            asyncio.gather(creating, resolving), timeout=10
        )
    assert ordinary_response.status_code == 201, ordinary_response.text
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert (
        await db_session.scalar(
            select(func.count()).select_from(Asset).where(Asset.name == duplicate_name)
        )
        == 1
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("field", "malformed"),
    [
        ("impacted_resources_snapshot", None),
        ("impacted_resources_snapshot", {}),
        ("scenario_snapshot", None),
        ("scenario_snapshot", []),
        ("proposed_changes", None),
        ("proposed_changes", []),
        ("base_versions", None),
        ("base_versions", {"asset": 999_999}),
        ("derived_impact_snapshot", []),
        (
            "derived_impact_snapshot",
            {
                "before": {"cif": "yes", "resulting_criticality": "invalid"},
                "after": {"cif": "yes", "resulting_criticality": "critical"},
            },
        ),
        (
            "impacted_resources_snapshot",
            [
                {
                    "resource_type": "asset",
                    "resource_id": 999_999,
                    "resource_name": "Semantically wrong Asset",
                    "base_governance_version": 1,
                }
            ],
        ),
        ("mutation_kind", "asset.link.unsupported.add"),
        ("approval_pending_changes", {"tampered": {"old": None, "new": True}}),
        ("proposed_changes", _deep_json_envelope(32)),
        (
            "scenario_snapshot",
            {
                "key": "protected_asset_edit",
                "requires_approval": True,
                "approver_roles": [{}],
            },
        ),
        (
            "scenario_snapshot",
            {
                "key": "protected_asset_edit",
                "requires_approval": True,
                "approver_roles": [["risk_manager"]],
            },
        ),
    ],
)
async def test_asset_resolution_totalizes_malformed_envelopes_and_releases_impact_locks(
    field: str,
    malformed: object,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Recognized Asset proposals must terminalize safely before JSON shape traversal."""
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    direct = _critical_payload(
        test_user_cro,
        name=f"Malformed resolution {field}",
        preliminary_criticality="low",
    )
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    assert created.status_code == 201, created.text
    asset_id = created.json()["id"]
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset_id}",
            json={
                "preliminary_criticality": "critical",
                "request_reason": "Review malformed resolution envelope",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    if field == "approval_pending_changes":
        await db_session.execute(
            update(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
            .values(pending_changes=malformed)
        )
    else:
        await db_session.execute(
            update(GovernedMutationProposal)
            .where(GovernedMutationProposal.id == proposal.id)
            .values({field: malformed})
        )
    malformed_notification = Notification(
        user_id=test_user_cro.id,
        type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
        title="Malformed Asset matrix notification",
        message="Correlated SQL must reject every malformed identity shape",
        resource_type="approval",
        resource_id=approval_id,
    )
    db_session.add(malformed_notification)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        inbox = await requester.get("/api/v1/notifications")
        unread = await requester.get("/api/v1/notifications/unread/count")
        read_attempt = await requester.post(
            f"/api/v1/notifications/{malformed_notification.id}/read"
        )
    assert inbox.status_code == 200, inbox.text
    assert malformed_notification.id not in {
        item["id"] for item in inbox.json()["items"]
    }
    assert unread.json()["count"] == 0
    assert read_attempt.status_code == 404, read_attempt.text

    async def fail_actor_collection(*_args, **_kwargs):
        raise AssertionError(
            "malformed Asset JSON must be rejected before actor-ID collection or locks"
        )

    monkeypatch.setattr(
        "app.services._governed_mutations.asset_resolution_policy._lock_asset_resolution_actors",
        fail_actor_collection,
    )

    async with client_factory(user=test_user_employee) as arbitrary_reader:
        denied = await arbitrary_reader.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={
                "resolution_notes": "Arbitrary reader must not expire malformed work"
            },
        )
    assert denied.status_code == 403, denied.text
    pending = await db_session.get(ApprovalRequest, approval_id)
    assert pending is not None and pending.status == ApprovalStatus.PENDING

    async with client_factory(user=test_user_risk_manager) as resolver:
        resolved = await resolver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Malformed envelope must expire safely"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    asset = await db_session.get(Asset, asset_id)
    assert asset is not None and asset.preliminary_criticality == "low"
    remaining_locks = await db_session.scalar(
        select(func.count())
        .select_from(GovernedMutationImpactLock)
        .where(
            GovernedMutationImpactLock.proposal_id == proposal.id,
            GovernedMutationImpactLock.released_at.is_(None),
        )
    )
    assert remaining_locks == 0


@pytest.mark.asyncio
async def test_protected_asset_missing_fixed_scenario_fails_closed(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
) -> None:
    async with client_factory(user=test_user_cro) as requester:
        response = await requester.post(
            "/api/v1/assets", json=_critical_payload(test_user_cro)
        )

    assert response.status_code == 500, response.text
    assert await db_session.scalar(select(func.count()).select_from(Asset)) == 0


@pytest.mark.asyncio
async def test_successful_direct_asset_lifecycle_mutations_increment_governance_version(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
) -> None:
    payload = _critical_payload(test_user_cro, preliminary_criticality="low")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as client:
        created = await client.post("/api/v1/assets", json=payload)
        assert created.status_code == 201, created.text
        asset_id = created.json()["id"]
        asset = await db_session.get(Asset, asset_id)
        assert asset is not None and asset.governance_version == 1

        updated = await client.patch(
            f"/api/v1/assets/{asset_id}",
            json={"description": "Direct governed version update"},
        )
        assert updated.status_code == 200, updated.text
        await db_session.refresh(asset)
        assert asset.governance_version == 2

        archived = await client.request("DELETE", f"/api/v1/assets/{asset_id}")
        assert archived.status_code == 204, archived.text
        await db_session.refresh(asset)
        assert asset.governance_version == 3

        restored = await client.post(f"/api/v1/assets/{asset_id}/restore")
        assert restored.status_code == 200, restored.text
        await db_session.refresh(asset)
        assert asset.governance_version == 4


@pytest.mark.asyncio
async def test_successful_direct_asset_relationship_mutations_increment_all_asset_versions(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
) -> None:
    first = Asset(
        name="Direct relationship first Asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="low",
    )
    second = Asset(
        name="Direct relationship second Asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="low",
    )
    vendor = Vendor(
        name="Direct relationship Vendor",
        process="Operations",
        department_id=test_user_cro.department_id,
        outsourcing_owner_user_id=test_user_cro.id,
    )
    risk = Risk(
        risk_id_code="DIRECT-ASSET-VERSION",
        name="Direct relationship Risk",
        process="Operations",
        description="Governance version proof",
        department_id=test_user_cro.department_id,
        owner_id=test_user_cro.id,
    )
    process = Process(
        f_code="F-DIRECT-ASSET-VERSION",
        l0_area="Operations",
        l1_process="Direct Asset version Process",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="no",
    )
    db_session.add_all([first, second, vendor, risk, process])
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        asset_link = await client.post(
            f"/api/v1/assets/{first.id}/asset-links",
            json={"dependent_asset_id": first.id, "supporting_asset_id": second.id},
        )
        assert asset_link.status_code == 201, asset_link.text
        await db_session.refresh(first)
        await db_session.refresh(second)
        assert (first.governance_version, second.governance_version) == (2, 2)

        removed_asset_link = await client.request(
            "DELETE",
            f"/api/v1/assets/{first.id}/asset-links/{asset_link.json()['id']}",
        )
        assert removed_asset_link.status_code == 204, removed_asset_link.text
        await db_session.refresh(first)
        await db_session.refresh(second)
        assert (first.governance_version, second.governance_version) == (3, 3)

        vendor_link = await client.post(
            f"/api/v1/assets/{first.id}/vendor-links",
            json={"vendor_id": vendor.id, "ict_service_code": "S01"},
        )
        assert vendor_link.status_code == 201, vendor_link.text
        await db_session.refresh(first)
        assert first.governance_version == 4
        removed_vendor_link = await client.request(
            "DELETE",
            f"/api/v1/assets/{first.id}/vendor-links/{vendor_link.json()['id']}",
        )
        assert removed_vendor_link.status_code == 204, removed_vendor_link.text
        await db_session.refresh(first)
        assert first.governance_version == 5

        risk_link = await client.post(
            f"/api/v1/risks/{risk.id}/asset-links",
            json={"asset_id": first.id},
        )
        assert risk_link.status_code == 201, risk_link.text
        await db_session.refresh(first)
        assert first.governance_version == 6
        removed_risk_link = await client.request(
            "DELETE",
            f"/api/v1/risks/{risk.id}/asset-links/{risk_link.json()['id']}",
        )
        assert removed_risk_link.status_code == 204, removed_risk_link.text
        await db_session.refresh(first)
        assert first.governance_version == 7

        process_link = await client.post(
            f"/api/v1/assets/{first.id}/process-links",
            json={"process_id": process.id},
        )
        assert process_link.status_code == 201, process_link.text
        await db_session.refresh(first)
        await db_session.refresh(process)
        assert (first.governance_version, process.governance_version) == (8, 2)

        process_point = await client.patch(
            f"/api/v1/processes/{process.id}",
            json={"notes": "Direct Process point rederivation"},
        )
        assert process_point.status_code == 200, process_point.text
        await db_session.refresh(first)
        await db_session.refresh(process)
        assert (first.governance_version, process.governance_version) == (9, 3)

        updated_process_link = await client.patch(
            f"/api/v1/assets/{first.id}/process-links/{process.id}",
            json={"spof": "Ne"},
        )
        assert updated_process_link.status_code == 200, updated_process_link.text
        await db_session.refresh(first)
        await db_session.refresh(process)
        assert (first.governance_version, process.governance_version) == (10, 4)

        removed_process_link = await client.request(
            "DELETE",
            f"/api/v1/assets/{first.id}/process-links/{process.id}",
        )
        assert removed_process_link.status_code == 204, removed_process_link.text
        await db_session.refresh(first)
        await db_session.refresh(process)
        assert (first.governance_version, process.governance_version) == (11, 5)


@pytest.mark.asyncio
async def test_asset_approval_expires_when_requester_is_revoked(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    direct = _critical_payload(test_user_cro, preliminary_criticality="low")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{created.json()['id']}",
            json={"preliminary_criticality": "critical", "request_reason": "Review"},
        )
    test_user_cro.is_active = False
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Must expire"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    asset = await db_session.get(Asset, created.json()["id"])
    assert asset is not None and asset.preliminary_criticality == "low"


@pytest.mark.asyncio
async def test_pending_asset_approval_expires_after_unrelated_direct_mutation(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    direct = _critical_payload(test_user_cro, preliminary_criticality="low")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{created.json()['id']}",
            json={
                "preliminary_criticality": "critical",
                "request_reason": "Pending protected edit",
            },
        )
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.execute(
        update(GovernedMutationImpactLock)
        .where(GovernedMutationImpactLock.proposal_id == proposal.id)
        .values(
            released_at=func.current_timestamp(), release_reason="test_direct_drift"
        )
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        changed = await requester.patch(
            f"/api/v1/assets/{created.json()['id']}",
            json={"notes": "Unrelated direct mutation"},
        )
    assert changed.status_code == 200, changed.text
    mutated = await db_session.get(Asset, created.json()["id"])
    assert mutated is not None and mutated.governance_version == 2
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Version drift must expire"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    asset = await db_session.get(Asset, created.json()["id"])
    assert asset is not None
    assert asset.notes == "Unrelated direct mutation"
    assert asset.preliminary_criticality == "low"


@pytest.mark.asyncio
async def test_pending_asset_approval_expires_after_direct_linked_process_point_mutation(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    payload = _critical_payload(test_user_cro, preliminary_criticality="low")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=payload)
    process = Process(
        f_code="F-ASSET-PENDING-DRIFT",
        l0_area="Operations",
        l1_process="Direct linked Process drift",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="no",
    )
    db_session.add(process)
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        linked = await requester.post(
            f"/api/v1/assets/{created.json()['id']}/process-links",
            json={"process_id": process.id},
        )
    assert linked.status_code == 201, linked.text
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{created.json()['id']}",
            json={
                "preliminary_criticality": "critical",
                "request_reason": "Pending Asset edit before Process drift",
            },
        )
        process_changed = await requester.patch(
            f"/api/v1/processes/{process.id}",
            json={"notes": "Direct linked Process point change"},
        )
    assert submitted.status_code == 202, submitted.text
    assert process_changed.status_code == 200, process_changed.text
    asset = await db_session.get(Asset, created.json()["id"])
    assert asset is not None and asset.governance_version == 3

    async with client_factory(user=test_user_risk_manager) as resolver:
        resolved = await resolver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={
                "resolution_notes": "Direct Process drift must expire Asset approval"
            },
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    await db_session.refresh(asset)
    assert asset.preliminary_criticality == "low"


@pytest.mark.asyncio
async def test_asset_creation_expires_when_requester_loses_current_write_permission(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets", json=_critical_payload(test_user_cro)
        )
    revoked_role = Role(
        name="asset_requester_revoked",
        display_name="Asset requester revoked",
        description="No Asset permissions",
    )
    db_session.add(revoked_role)
    await db_session.flush()
    await db_session.execute(
        update(User).where(User.id == test_user_cro.id).values(role_id=revoked_role.id)
    )
    await db_session.commit()
    db_session.expunge_all()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Requester authority is stale"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert await db_session.scalar(select(func.count()).select_from(Asset)) == 0


@pytest.mark.asyncio
async def test_asset_edit_expires_when_requester_loses_current_asset_scope(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    direct = _critical_payload(
        test_user_cro,
        preliminary_criticality="low",
        business_owner_user_id=test_user_risk_manager.id,
        ict_owner_user_id=test_user_risk_manager.id,
    )
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{created.json()['id']}",
            json={"preliminary_criticality": "critical", "request_reason": "Review"},
        )

    unrelated = Department(
        name="Unrelated requester department",
        code="UNRELATED-REQUESTER",
        is_active=True,
    )
    db_session.add(unrelated)
    await db_session.flush()
    await db_session.execute(
        update(User)
        .where(User.id == test_user_cro.id)
        .values(department_id=unrelated.id, access_scope=AccessScope.DEPARTMENT)
    )
    await db_session.commit()
    db_session.expunge_all()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Requester scope is stale"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    asset = await db_session.get(Asset, created.json()["id"])
    assert asset is not None and asset.preliminary_criticality == "low"


@pytest.mark.asyncio
@pytest.mark.parametrize("stale_mode", ["disabled", "missing", "roles_changed"])
async def test_asset_stale_scenario_expires_for_configured_global_actor_but_not_arbitrary_reader(
    stale_mode: str,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets", json=_critical_payload(test_user_cro)
        )
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    if stale_mode == "disabled":
        scenario.requires_approval = False
    elif stale_mode == "roles_changed":
        scenario.approver_roles = ["cro"]
    else:
        await db_session.execute(
            delete(ApprovalScenario).where(ApprovalScenario.id == scenario.id)
        )
    await db_session.commit()

    async with client_factory(user=test_user_employee) as arbitrary_reader:
        denied = await arbitrary_reader.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Must not resolve another user's request"},
        )
    assert denied.status_code == 403, denied.text
    pending = await db_session.get(ApprovalRequest, submitted.json()["approval_id"])
    assert pending is not None and pending.status == ApprovalStatus.PENDING

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Must expire"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    approval = await db_session.get(ApprovalRequest, submitted.json()["approval_id"])
    assert approval is not None and approval.status == ApprovalStatus.EXPIRED
    assert await db_session.scalar(select(func.count()).select_from(Asset)) == 0


@pytest.mark.asyncio
async def test_malformed_asset_edit_replay_payload_expires_without_applying(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    direct = _critical_payload(test_user_cro, preliminary_criticality="low")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{created.json()['id']}",
            json={"preliminary_criticality": "critical", "request_reason": "Review"},
        )
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
    )
    assert proposal is not None
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == proposal.id)
        .values(proposed_changes={"after": {"unexpected_replay_field": "unsafe"}})
    )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Malformed payload must expire"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    asset = await db_session.get(Asset, created.json()["id"])
    assert asset is not None and asset.preliminary_criticality == "low"


@pytest.mark.asyncio
async def test_asset_edit_expires_when_proposed_owner_is_no_longer_active(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    direct = _critical_payload(test_user_cro, preliminary_criticality="low")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{created.json()['id']}",
            json={
                "preliminary_criticality": "critical",
                "business_owner_user_id": test_user_employee.id,
                "request_reason": "Review proposed owner",
            },
        )
    assert submitted.status_code == 202, submitted.text
    await db_session.execute(
        update(User).where(User.id == test_user_employee.id).values(is_active=False)
    )
    await db_session.commit()
    db_session.expunge_all()

    async with client_factory(user=test_user_risk_manager) as resolver:
        resolved = await resolver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Proposed owner is stale"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    asset = await db_session.get(Asset, created.json()["id"])
    assert asset is not None and asset.business_owner_user_id == test_user_cro.id


@pytest.mark.asyncio
async def test_asset_approval_rejects_resolver_after_global_scope_revocation(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets", json=_critical_payload(test_user_cro)
        )
    test_user_risk_manager.access_scope = AccessScope.DEPARTMENT
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Must reject"},
        )

    assert resolved.status_code == 403, resolved.text
    approval = await db_session.get(ApprovalRequest, submitted.json()["approval_id"])
    assert approval is not None and approval.status == ApprovalStatus.PENDING


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["scope_revoked", "blank_reason", "scenario_disabled"])
async def test_asset_rejection_uses_the_same_live_policy_as_approval(
    mode: str,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets", json=_critical_payload(test_user_cro)
        )
    assert submitted.status_code == 202, submitted.text
    if mode == "scope_revoked":
        test_user_risk_manager.access_scope = AccessScope.DEPARTMENT
    elif mode == "scenario_disabled":
        scenario = await db_session.scalar(
            select(ApprovalScenario).where(
                ApprovalScenario.key == "protected_asset_edit"
            )
        )
        assert scenario is not None
        scenario.requires_approval = False
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as resolver:
        rejected = await resolver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/reject",
            json={
                "resolution_notes": ""
                if mode == "blank_reason"
                else "Live rejection policy"
            },
        )
    approval = await db_session.get(ApprovalRequest, submitted.json()["approval_id"])
    assert approval is not None
    if mode == "scenario_disabled":
        assert rejected.status_code == 200, rejected.text
        assert approval.status == ApprovalStatus.EXPIRED
    else:
        assert rejected.status_code in {400, 403, 422}, rejected.text
        assert approval.status == ApprovalStatus.PENDING


@pytest.mark.asyncio
async def test_asset_creation_approval_expires_when_owner_reference_is_revoked(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets", json=_critical_payload(test_user_employee)
        )
    test_user_employee.is_active = False
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Must expire"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert await db_session.scalar(select(func.count()).select_from(Asset)) == 0


@pytest.mark.asyncio
async def test_protected_asset_scenario_exposes_fixed_read_only_policy(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
) -> None:
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as client:
        listed = await client.get("/api/v1/riskhub/approval-scenarios")
        rejected = await client.patch(
            "/api/v1/riskhub/approval-scenarios/protected_asset_edit",
            json={
                "fixed_policy_definition": {
                    "threshold": "current_or_proposed_cif_yes_or_resulting_criticality_critical",
                    "covered_actions": ["create", "edit", "link", "archive"],
                    "allow_self_approval": True,
                }
            },
        )
    assert listed.status_code == 200, listed.text
    scenario = next(
        row for row in listed.json() if row["key"] == "protected_asset_edit"
    )
    assert scenario["fixed_policy"] is True
    assert scenario["fixed_policy_definition"] == {
        "threshold": "current_or_proposed_cif_yes_or_resulting_criticality_critical",
        "covered_actions": ["create", "edit", "link", "archive"],
        "allow_self_approval": False,
    }
    assert rejected.status_code == 422, rejected.text


@pytest.mark.asyncio
async def test_protected_asset_creation_remains_rowless_until_independent_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets", json=_critical_payload(test_user_cro)
        )

    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    approval = await db_session.get(ApprovalRequest, approval_id)
    assert approval is not None
    assert approval.resource_type.value == "asset"
    assert approval.action_type == ApprovalActionType.CREATE
    assert approval.resource_id is None
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == approval_id
            )
        )
    ).scalar_one()
    assert proposal.mutation_kind == "asset.create"
    assert proposal.primary_resource_id is None
    assert proposal.impacted_resources_snapshot == []
    assert await db_session.scalar(select(func.count()).select_from(Asset)) == 0
    assert (
        await db_session.scalar(
            select(func.count()).select_from(GovernedMutationImpactLock)
        )
        == 0
    )

    async with client_factory(user=test_user_risk_manager) as approver:
        queue = await approver.get("/api/v1/approvals?status=pending")
    async with client_factory(user=test_user_cro) as requester:
        detail = await requester.get(f"/api/v1/approvals/{approval_id}")
        my_pending = await requester.get(
            "/api/v1/approvals?status=pending&my_requests=true"
        )
    assert queue.status_code == 200, queue.text
    assert approval_id in {item["id"] for item in queue.json()["items"]}
    queue_item = next(
        item for item in queue.json()["items"] if item["id"] == approval_id
    )
    assert queue_item["governed_mutation"] is not None
    assert (
        queue_item["governed_mutation"]["derived_impact"]["after"][
            "resulting_criticality"
        ]
        == "critical"
    )
    assert my_pending.status_code == 200, my_pending.text
    assert approval_id in {item["id"] for item in my_pending.json()["items"]}
    assert detail.status_code == 200, detail.text
    assert detail.json()["resource_type"] == "asset"
    assert detail.json()["governed_mutation"] is not None

    await db_session.refresh(approval, ["governed_mutation_proposal"])
    notifications = await NotificationService.notify_governed_action_required(
        db_session,
        approval,
        event="submitted",
    )
    await db_session.commit()
    assert len(notifications) == 1
    assert notifications[0].user_id == test_user_risk_manager.id
    async with client_factory(user=test_user_risk_manager) as approver:
        inbox = await approver.get("/api/v1/notifications")
    assert inbox.status_code == 200, inbox.text
    assert approval_id in {item["resource_id"] for item in inbox.json()["items"]}

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approved protected Asset creation"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == ApprovalStatus.APPROVED.value.lower()
    await db_session.refresh(approval, ["governed_mutation_proposal"])
    requester_outcome = await NotificationService.notify_governed_request_update(
        db_session,
        approval,
        outcome="approved",
    )
    await db_session.commit()
    assert requester_outcome is not None
    assert requester_outcome.title == "Protected Asset request approved"
    async with client_factory(user=test_user_cro) as requester:
        my_history = await requester.get(
            "/api/v1/approvals?status=approved&my_requests=true"
        )
        requester_inbox = await requester.get("/api/v1/notifications")
    assert my_history.status_code == 200, my_history.text
    assert approval_id in {item["id"] for item in my_history.json()["items"]}
    assert requester_inbox.status_code == 200, requester_inbox.text
    assert requester_outcome.id in {
        item["id"] for item in requester_inbox.json()["items"]
    }
    created = (await db_session.execute(select(Asset))).scalar_one()
    assert created.name == "Protected critical Asset"
    assert created.governance_version == 1


@pytest.mark.asyncio
async def test_proposed_critical_asset_edit_preserves_approved_truth_and_locks_until_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    direct = _critical_payload(
        test_user_cro,
        name="Approved ordinary Asset",
        preliminary_criticality="low",
    )
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    assert created.status_code == 201, created.text
    asset_id = created.json()["id"]
    await _scenario(db_session)

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset_id}",
            json={
                "preliminary_criticality": "critical",
                "request_reason": "Review classification increase",
            },
        )
        conflicted = await requester.patch(
            f"/api/v1/assets/{asset_id}",
            json={"notes": "must remain locked"},
        )
        visible = await requester.get(f"/api/v1/assets/{asset_id}")

    assert submitted.status_code == 202, submitted.text
    assert conflicted.status_code == 409, conflicted.text
    assert visible.json()["capabilities"]["has_pending_change"] is True
    assert visible.json()["capabilities"]["business_edit_blocked"] is True
    assert (
        visible.json()["pending_change"]["approval_id"]
        == submitted.json()["approval_id"]
    )
    assert visible.json()["pending_change"]["capabilities"]["can_cancel"] is True
    assert visible.json()["pending_change"]["mutation_kind"] == "asset.edit"
    assert visible.json()["pending_change"]["relationship_change"] is None
    assert visible.json()["pending_change"]["impacted_resources"] == [
        {"resource_type": "asset", "resource_name": "Approved ordinary Asset"}
    ]
    assert (
        _replay_identifier_keys(
            {
                "before": visible.json()["pending_change"]["before"],
                "after": visible.json()["pending_change"]["after"],
                "derived_impact": visible.json()["pending_change"]["derived_impact"],
            }
        )
        == set()
    )
    async with client_factory(user=test_user_employee) as ordinary_reader:
        reader_visible = await ordinary_reader.get(f"/api/v1/assets/{asset_id}")
        reader_approval = await ordinary_reader.get(
            f"/api/v1/approvals/{submitted.json()['approval_id']}"
        )
    assert reader_visible.status_code == 200, reader_visible.text
    redacted_pending = reader_visible.json()["pending_change"]
    assert redacted_pending == {
        "approval_id": None,
        "proposal_id": None,
        "proposal_version": None,
        "status": "pending",
        "requested_at": visible.json()["pending_change"]["requested_at"],
        "requested_by_name": None,
        "reason": "",
        "generic_label": "protected_asset_change",
        "mutation_kind": None,
        "before": {},
        "after": {},
        "derived_impact": {},
        "impacted_resources": [],
        "relationship_change": None,
        "capabilities": {"can_view_diff": False, "can_cancel": False},
    }
    assert reader_visible.json()["capabilities"]["has_pending_change"] is True
    assert reader_approval.status_code in {403, 404}
    assert conflicted.json()["detail"]["code"] == "asset_pending_mutation"
    assert visible.json()["preliminary_criticality"] == "low"
    approval_id = submitted.json()["approval_id"]
    lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_type == "asset",
                GovernedMutationImpactLock.resource_id == asset_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
    ).scalar_one()
    assert lock.base_governance_version == 1

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approved classification increase"},
        )

    assert approved.status_code == 200, approved.text
    refreshed = await db_session.get(Asset, asset_id)
    assert refreshed is not None
    assert refreshed.preliminary_criticality == "critical"
    assert refreshed.governance_version == 2
    await db_session.refresh(lock)
    assert lock.release_reason == "approved"


@pytest.mark.asyncio
async def test_protected_asset_request_cannot_be_self_approved_and_requester_can_cancel(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    direct = _critical_payload(test_user_cro, name="Cancellation Asset")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    asset_id = created.json()["id"]
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{asset_id}",
            json={"notes": "proposal only", "request_reason": "Review notes"},
        )
        approval_id = submitted.json()["approval_id"]
        self_approval = await requester.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Self approval forbidden"},
        )
        cancelled = await requester.post(f"/api/v1/approvals/{approval_id}/cancel")

    assert self_approval.status_code == 403, self_approval.text
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    asset = await db_session.get(Asset, asset_id)
    assert asset is not None and asset.notes is None and asset.governance_version == 1
    lock = (
        await db_session.execute(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.resource_type == "asset",
                GovernedMutationImpactLock.resource_id == asset_id,
            )
        )
    ).scalar_one()
    assert lock.release_reason == "cancelled"


@pytest.mark.asyncio
async def test_protected_asset_archive_stays_active_until_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    direct = _critical_payload(test_user_cro, name="Archive protected Asset")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    asset_id = created.json()["id"]
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.request(
            "DELETE",
            f"/api/v1/assets/{asset_id}",
            json={"request_reason": "Retire protected Asset"},
        )
        still_active = await requester.get(f"/api/v1/assets/{asset_id}")

    assert submitted.status_code == 202, submitted.text
    assert still_active.status_code == 200
    assert still_active.json()["is_archived"] is False

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved retirement"},
        )

    assert approved.status_code == 200, approved.text
    asset = await db_session.get(Asset, asset_id)
    assert asset is not None and asset.is_archived is True
    assert asset.governance_version == 2


@pytest.mark.asyncio
async def test_protected_asset_archive_expires_when_requester_loses_delete_permission(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    payload = _critical_payload(test_user_cro, name="Archive authority Asset")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=payload)
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.request(
            "DELETE",
            f"/api/v1/assets/{created.json()['id']}",
            json={"request_reason": "Retire protected Asset"},
        )
    assert submitted.status_code == 202, submitted.text

    restricted_role = Role(
        name="asset_archive_requester_revoked",
        display_name="Asset archive requester revoked",
        description="Asset read and write but no delete",
    )
    db_session.add(restricted_role)
    await db_session.flush()
    permissions = [
        Permission(resource="assets", action="read", description="Read Assets"),
        Permission(resource="assets", action="write", description="Write Assets"),
    ]
    db_session.add_all(permissions)
    await db_session.flush()
    db_session.add_all(
        RolePermission(role_id=restricted_role.id, permission_id=permission.id)
        for permission in permissions
    )
    await db_session.execute(
        update(User)
        .where(User.id == test_user_cro.id)
        .values(role_id=restricted_role.id)
    )
    await db_session.commit()
    db_session.expunge_all()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Requester archive authority is stale"},
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    asset = await db_session.get(Asset, created.json()["id"])
    assert asset is not None and asset.is_archived is False


@pytest.mark.asyncio
async def test_process_asset_link_uses_one_composite_approval_and_applies_all_impacts(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    asset_scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert asset_scenario is not None
    asset_scenario.requires_approval = False
    await db_session.commit()
    dummy_payload = _critical_payload(
        test_user_cro,
        name="Non-colliding Asset id spacer",
        preliminary_criticality="low",
    )
    dummy_payload.pop("request_reason")
    asset_payload = _critical_payload(test_user_cro, name="Composite protected Asset")
    asset_payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        dummy_asset = await requester.post("/api/v1/assets", json=dummy_payload)
        created_asset = await requester.post("/api/v1/assets", json=asset_payload)
    assert dummy_asset.status_code == 201, dummy_asset.text
    asset_id = created_asset.json()["id"]
    process = Process(
        f_code="F-COMPOSITE",
        l0_area="Operations",
        l1_process="Composite protected Process",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="yes",
    )
    db_session.add(process)
    await db_session.commit()
    process_id = process.id
    assert asset_id != process_id
    asset_scenario.requires_approval = True
    await db_session.commit()
    await _process_scenario(db_session)

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/assets/{asset_id}/process-links",
            json={
                "process_id": process_id,
                "is_primary": True,
                "significance": "Kritická podpora procesu",
                "request_reason": "Review complete downstream impact",
            },
        )

    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id == approval_id
            )
        )
    ).scalar_one()
    assert {row["resource_type"] for row in proposal.impacted_resources_snapshot} == {
        "asset",
        "process",
    }
    assert set(proposal.derived_impact_snapshot) == {"assets", "processes"}
    assert (
        await db_session.scalar(select(func.count()).select_from(ProcessAssetLink)) == 0
    )

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approved all derived impacts"},
        )

    assert approved.status_code == 200, approved.text
    assert (
        await db_session.scalar(select(func.count()).select_from(ProcessAssetLink)) == 1
    )
    asset = await db_session.get(Asset, asset_id)
    process = await db_session.get(Process, process_id)
    assert asset is not None and asset.governance_version == 2
    assert process is not None and process.governance_version == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["edit", "archive", "link"])
@pytest.mark.parametrize("policy_drift", [False, True])
async def test_composite_process_asset_policy_uses_role_intersection_for_every_action(
    mutation: str,
    policy_drift: bool,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    await _process_scenario(db_session)
    asset_scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    process_scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_process_edit")
    )
    assert asset_scenario is not None and process_scenario is not None
    asset_scenario.approver_roles = ["cro"]
    process_scenario.approver_roles = ["risk_manager", "cro"]
    if mutation == "archive":
        permission = await db_session.scalar(
            select(Permission).where(
                Permission.resource == "processes",
                Permission.action == "delete",
            )
        )
        if permission is None:
            permission = Permission(
                resource="processes",
                action="delete",
                description="Delete Processes",
            )
            db_session.add(permission)
            await db_session.flush()
        role_permission = RolePermission(
            role_id=test_user_risk_manager.role_id,
            permission_id=permission.id,
        )
        role_permission.permission = permission
        db_session.add(role_permission)
        assert test_user_risk_manager.role is not None
        test_user_risk_manager.role.permissions.append(role_permission)
    process = Process(
        f_code=f"F-INTERSECTION-{mutation}",
        l0_area="Operations",
        l1_process=f"Intersection {mutation}",
        process_owner_user_id=test_user_risk_manager.id,
        owning_department_id=test_user_risk_manager.department_id,
        cif_override="yes",
    )
    asset = Asset(
        name=f"Intersection Asset {mutation}",
        business_owner_user_id=test_user_risk_manager.id,
        ict_owner_user_id=test_user_risk_manager.id,
        owning_department_id=test_user_risk_manager.department_id,
        preliminary_criticality="critical",
    )
    db_session.add_all([process, asset])
    await db_session.flush()
    if mutation != "link":
        db_session.add(
            ProcessAssetLink(
                process_id=process.id,
                asset_id=asset.id,
                is_primary=True,
                significance="Kritická podpora procesu",
            )
        )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as requester:
        if mutation == "edit":
            submitted = await requester.patch(
                f"/api/v1/processes/{process.id}",
                json={
                    "l1_process": "Intersection renamed",
                    "request_reason": "Apply both configured policies",
                },
            )
        elif mutation == "archive":
            submitted = await requester.request(
                "DELETE",
                f"/api/v1/processes/{process.id}",
                json={"request_reason": "Apply both configured policies"},
            )
        else:
            submitted = await requester.post(
                f"/api/v1/assets/{asset.id}/process-links",
                json={
                    "process_id": process.id,
                    "is_primary": True,
                    "significance": "Kritická podpora procesu",
                    "request_reason": "Apply both configured policies",
                },
            )

    assert submitted.status_code == 202, submitted.text
    approval = await db_session.get(ApprovalRequest, submitted.json()["approval_id"])
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
    )
    assert approval is not None and proposal is not None
    assert approval.scenario_approver_roles == ["cro"]
    assert proposal.proposed_changes["triggered_scenarios"] == [
        "protected_process_edit",
        "protected_asset_edit",
    ]
    assert proposal.scenario_snapshot["triggered_policies"] == [
        {
            "key": "protected_process_edit",
            "enabled": True,
            "policy_version": 1,
            "configured_roles": ["risk_manager", "cro"],
            "invariants": {"independent": True, "allow_self_approval": False},
        },
        {
            "key": "protected_asset_edit",
            "enabled": True,
            "policy_version": 1,
            "configured_roles": ["cro"],
            "invariants": {"independent": True, "allow_self_approval": False},
        },
    ]
    await db_session.refresh(approval, ["governed_mutation_proposal"])
    generated_notifications = await NotificationService.notify_governed_action_required(
        db_session,
        approval,
        event="submitted",
    )
    await db_session.commit()
    assert len(generated_notifications) == 1
    async with client_factory(user=test_user_cro) as resolver:
        resolver_queue = await resolver.get("/api/v1/approvals?status=pending")
        resolver_count = await resolver.get("/api/v1/approvals/pending/count")
        resolver_inbox = await resolver.get("/api/v1/notifications")
        resolver_unread = await resolver.get("/api/v1/notifications/unread/count")
    async with client_factory(user=test_user_risk_manager) as requester:
        requester_queue = await requester.get(
            "/api/v1/approvals?status=pending&my_requests=true"
        )
    assert approval.id in {item["id"] for item in resolver_queue.json()["items"]}
    assert resolver_count.json()["count"] >= 1
    assert approval.id in {
        item["resource_id"] for item in resolver_inbox.json()["items"]
    }
    assert resolver_unread.json()["count"] >= 1
    assert approval.id in {item["id"] for item in requester_queue.json()["items"]}
    original_scenario_snapshot = deepcopy(proposal.scenario_snapshot)
    proposal.scenario_snapshot["triggered_policies"][0]["configured_roles"] = [{}]
    with pytest.raises(ValueError, match="[Mm]alformed"):
        (
            strict_governed_process_identity(proposal)
            if mutation == "edit"
            else strict_extended_process_identity(proposal)
        )
    set_committed_value(proposal, "scenario_snapshot", original_scenario_snapshot)
    original_proposed_changes = deepcopy(proposal.proposed_changes)
    proposal.proposed_changes["triggered_scenarios"] = [{}]
    with pytest.raises(ValueError, match="[Mm]alformed"):
        (
            strict_governed_process_identity(proposal)
            if mutation == "edit"
            else strict_extended_process_identity(proposal)
        )
    set_committed_value(proposal, "proposed_changes", original_proposed_changes)
    original_derived_impact = deepcopy(proposal.derived_impact_snapshot)
    proposal.derived_impact_snapshot["assets"].append(
        deepcopy(proposal.derived_impact_snapshot["assets"][0])
    )
    with pytest.raises(ValueError, match="[Mm]alformed"):
        (
            strict_governed_process_identity(proposal)
            if mutation == "edit"
            else strict_extended_process_identity(proposal)
        )
    set_committed_value(
        proposal,
        "derived_impact_snapshot",
        deepcopy(original_derived_impact),
    )
    proposal.derived_impact_snapshot["processes"][0]["unexpected"] = True
    with pytest.raises(ValueError, match="[Mm]alformed"):
        (
            strict_governed_process_identity(proposal)
            if mutation == "edit"
            else strict_extended_process_identity(proposal)
        )
    set_committed_value(proposal, "derived_impact_snapshot", original_derived_impact)
    approval_id = approval.id
    if policy_drift:
        asset_scenario.approver_roles = ["risk_manager", "cro"]
        await db_session.commit()
    async with client_factory(user=test_user_cro) as resolver:
        resolved = await resolver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "CRO is in every configured policy"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == ("expired" if policy_drift else "approved")


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["edit", "archive", "link"])
async def test_composite_process_asset_disjoint_roles_fail_without_proposal(
    mutation: str,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    await _process_scenario(db_session)
    asset_scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    process_scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_process_edit")
    )
    assert asset_scenario is not None and process_scenario is not None
    asset_scenario.approver_roles = ["cro"]
    process_scenario.approver_roles = ["risk_manager"]
    if mutation == "archive":
        permission = await db_session.scalar(
            select(Permission).where(
                Permission.resource == "processes",
                Permission.action == "delete",
            )
        )
        if permission is None:
            permission = Permission(
                resource="processes",
                action="delete",
                description="Delete Processes",
            )
            db_session.add(permission)
            await db_session.flush()
        role_permission = RolePermission(
            role_id=test_user_cro.role_id,
            permission_id=permission.id,
        )
        role_permission.permission = permission
        db_session.add(role_permission)
        assert test_user_cro.role is not None
        test_user_cro.role.permissions.append(role_permission)
    process = Process(
        f_code="F-DISJOINT",
        l0_area="Operations",
        l1_process="Disjoint policies",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="yes",
    )
    asset = Asset(
        name="Disjoint critical Asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="critical",
    )
    db_session.add_all([process, asset])
    await db_session.flush()
    if mutation != "link":
        db_session.add(
            ProcessAssetLink(process_id=process.id, asset_id=asset.id, is_primary=True)
        )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        if mutation == "edit":
            submitted = await requester.patch(
                f"/api/v1/processes/{process.id}",
                json={
                    "l1_process": "Must not queue",
                    "request_reason": "No common resolver exists",
                },
            )
        elif mutation == "archive":
            submitted = await requester.request(
                "DELETE",
                f"/api/v1/processes/{process.id}",
                json={"request_reason": "No common resolver exists"},
            )
        else:
            submitted = await requester.post(
                f"/api/v1/assets/{asset.id}/process-links",
                json={
                    "process_id": process.id,
                    "is_primary": True,
                    "significance": "Kritická podpora procesu",
                    "request_reason": "No common resolver exists",
                },
            )
    assert submitted.status_code in {409, 422}, submitted.text
    assert (
        await db_session.scalar(
            select(func.count()).select_from(GovernedMutationProposal)
        )
        == 0
    )
    assert (
        await db_session.scalar(
            select(func.count()).select_from(GovernedMutationImpactLock)
        )
        == 0
    )
    assert await db_session.scalar(select(func.count()).select_from(OutboxEvent)) == 0
    assert await db_session.scalar(select(func.count()).select_from(Notification)) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "corruption",
    [
        "impacts_null",
        "descriptor_list",
        "resource_type_object",
        "resource_id_object",
        "base_version_list",
        "nested_role_object",
        "trigger_object",
    ],
)
async def test_malformed_composite_process_identity_expires_and_releases_locks(
    corruption: str,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    await _process_scenario(db_session)
    process = Process(
        f_code=f"F-MALFORMED-{corruption}",
        l0_area="Operations",
        l1_process="Malformed Composite",
        process_owner_user_id=test_user_risk_manager.id,
        owning_department_id=test_user_risk_manager.department_id,
        cif_override="yes",
    )
    asset = Asset(
        name="Malformed Composite Asset",
        business_owner_user_id=test_user_risk_manager.id,
        ict_owner_user_id=test_user_risk_manager.id,
        owning_department_id=test_user_risk_manager.department_id,
        preliminary_criticality="critical",
    )
    db_session.add_all([process, asset])
    await db_session.flush()
    db_session.add(
        ProcessAssetLink(process_id=process.id, asset_id=asset.id, is_primary=True)
    )
    await db_session.commit()
    async with client_factory(user=test_user_risk_manager) as requester:
        submitted = await requester.patch(
            f"/api/v1/processes/{process.id}",
            json={
                "l1_process": "Malformed Composite changed",
                "request_reason": "Exercise total strict parser",
            },
        )
    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    impacts = deepcopy(proposal.impacted_resources_snapshot)
    scenario = deepcopy(proposal.scenario_snapshot)
    changes = deepcopy(proposal.proposed_changes)
    if corruption == "impacts_null":
        impacts = None
    elif corruption == "descriptor_list":
        impacts[0] = []
    elif corruption == "resource_type_object":
        impacts[0]["resource_type"] = {}
    elif corruption == "resource_id_object":
        impacts[0]["resource_id"] = {}
    elif corruption == "base_version_list":
        impacts[0]["base_governance_version"] = []
    elif corruption == "nested_role_object":
        scenario["approver_roles"] = [{}]
    elif corruption == "trigger_object":
        changes["triggered_scenarios"] = [{}]
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == proposal.id)
        .values(
            impacted_resources_snapshot=impacts,
            scenario_snapshot=scenario,
            proposed_changes=changes,
        )
    )
    await db_session.commit()
    async with client_factory(user=test_user_cro) as resolver:
        resolved = await resolver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Malformed proposal must expire"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(GovernedMutationImpactLock)
            .where(
                GovernedMutationImpactLock.proposal_id == proposal.id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
        == 0
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["edit", "archive"])
async def test_process_point_mutation_tracks_and_versions_linked_asset_impact(
    mutation: str,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    process = Process(
        f_code=f"F-DOWNSTREAM-{mutation}",
        l0_area="Operations",
        l1_process=f"Downstream {mutation}",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="yes",
    )
    asset = Asset(
        name=f"Downstream Asset {mutation}",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="low",
    )
    second_asset = Asset(
        name=f"Second downstream Asset {mutation}",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="medium",
    )
    db_session.add_all([process, asset, second_asset])
    await db_session.flush()
    db_session.add_all(
        [
            ProcessAssetLink(
                process_id=process.id,
                asset_id=asset.id,
                is_primary=True,
                significance="Kritická podpora procesu",
            ),
            ProcessAssetLink(
                process_id=process.id,
                asset_id=second_asset.id,
                significance="Podpora procesu",
            ),
        ]
    )
    await db_session.commit()
    await _process_scenario(db_session)

    async with client_factory(user=test_user_cro) as requester:
        if mutation == "edit":
            submitted = await requester.patch(
                f"/api/v1/processes/{process.id}",
                json={
                    "cif_override": "no",
                    "request_reason": "Review downstream Asset impact",
                },
            )
        else:
            submitted = await requester.request(
                "DELETE",
                f"/api/v1/processes/{process.id}",
                json={"request_reason": "Review downstream Asset retirement impact"},
            )
    assert submitted.status_code == 202, submitted.text
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
    )
    assert proposal is not None
    assert [row["resource_type"] for row in proposal.impacted_resources_snapshot] == [
        "asset",
        "asset",
        "process",
    ]
    assert all(
        set(row)
        == {
            "resource_type",
            "resource_id",
            "resource_name",
            "base_governance_version",
        }
        for row in proposal.impacted_resources_snapshot
    )
    assert [
        (row["resource_type"], row["resource_id"])
        for row in proposal.impacted_resources_snapshot
    ] == sorted(
        {
            (row["resource_type"], row["resource_id"])
            for row in proposal.impacted_resources_snapshot
        }
    )
    assert all(
        isinstance(row["resource_name"], str)
        and row["resource_name"] == row["resource_name"].strip()
        and row["resource_name"]
        and not row["resource_name"].isdigit()
        for row in proposal.impacted_resources_snapshot
    )
    assert set(proposal.base_versions) == {
        "process",
        f"asset:{asset.id}",
        f"asset:{second_asset.id}",
    }
    assert proposal.scenario_snapshot["approver_roles"] == [
        "risk_manager",
        "cro",
    ]
    assert [
        policy["key"] for policy in proposal.scenario_snapshot["triggered_policies"]
    ] == proposal.proposed_changes["triggered_scenarios"]
    assert all(
        set(policy)
        == {
            "key",
            "enabled",
            "policy_version",
            "configured_roles",
            "invariants",
        }
        and policy["enabled"] is True
        and policy["policy_version"] == 1
        and policy["invariants"] == {"independent": True, "allow_self_approval": False}
        for policy in proposal.scenario_snapshot["triggered_policies"]
    )
    if mutation == "edit":
        assert strict_governed_process_identity(proposal) is not None
    else:
        assert strict_extended_process_identity(proposal) is not None
    assert set(proposal.derived_impact_snapshot) == {"assets", "processes"}
    locks = list(
        (
            await db_session.execute(
                select(GovernedMutationImpactLock).where(
                    GovernedMutationImpactLock.proposal_id == proposal.id
                )
            )
        ).scalars()
    )
    assert {(lock.resource_type, lock.resource_id) for lock in locks} == {
        ("asset", asset.id),
        ("asset", second_asset.id),
        ("process", process.id),
    }

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved downstream impact"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "approved"
    await db_session.refresh(asset)
    await db_session.refresh(second_asset)
    assert asset.governance_version == 2
    assert second_asset.governance_version == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["edit", "archive"])
async def test_non_cif_process_point_mutation_is_governed_by_enabled_asset_policy(
    mutation: str,
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    """Asset-only consequences remain governed when the Process policy is disabled."""
    await _scenario(db_session)
    await _process_scenario(db_session)
    process_scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_process_edit")
    )
    assert process_scenario is not None
    process_scenario.requires_approval = False
    process = Process(
        f_code=f"F-ASSET-{mutation}",
        l0_area="Operations",
        l1_process=f"Asset governed {mutation}",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="no",
    )
    assets = [
        Asset(
            name=f"Protected downstream {mutation} {index}",
            business_owner_user_id=test_user_employee.id,
            ict_owner_user_id=test_user_risk_manager.id,
            owning_department_id=test_user_cro.department_id,
            preliminary_criticality="critical",
        )
        for index in (1, 2)
    ]
    db_session.add_all([process, *assets])
    await db_session.flush()
    db_session.add_all(
        [
            ProcessAssetLink(
                process_id=process.id,
                asset_id=asset.id,
                is_primary=index == 0,
                significance="Kritická podpora procesu",
            )
            for index, asset in enumerate(assets)
        ]
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        if mutation == "edit":
            submitted = await requester.patch(
                f"/api/v1/processes/{process.id}",
                json={
                    "l1_process": "Asset-governed renamed Process",
                    "request_reason": "Review protected downstream Assets",
                },
            )
        else:
            submitted = await requester.request(
                "DELETE",
                f"/api/v1/processes/{process.id}",
                json={"request_reason": "Review protected downstream Assets"},
            )

    assert submitted.status_code == 202, submitted.text
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
    )
    assert proposal is not None
    assert proposal.proposed_changes["triggered_scenarios"] == ["protected_asset_edit"]
    assert [row["resource_type"] for row in proposal.impacted_resources_snapshot] == [
        "asset",
        "asset",
        "process",
    ]
    async with client_factory(user=test_user_cro) as requester:
        requester_asset = await requester.get(f"/api/v1/assets/{assets[0].id}")
        approval_detail = await requester.get(
            f"/api/v1/approvals/{submitted.json()['approval_id']}"
        )
    assert requester_asset.status_code == 200, requester_asset.text
    requester_projection = requester_asset.json()
    assert requester_projection["pending_change"] is not None
    assert requester_projection["capabilities"]["business_edit_blocked"] is True
    assert requester_projection["capabilities"]["can_update"] is False
    assert approval_detail.status_code == 200, approval_detail.text
    derived = approval_detail.json()["governed_mutation"]["derived_impact"]
    assert len(derived["assets"]) == 2
    assert _replay_identifier_keys(derived) == set()
    impacted = approval_detail.json()["governed_mutation"]["impacted_resources"]
    impacted_assets = [item for item in impacted if item["resource_type"] == "asset"]
    assert len(impacted_assets) == 2
    assert {item["resource_name"] for item in impacted_assets} == {
        asset.name for asset in assets
    }

    async with client_factory(user=test_user_employee) as unrelated_reader:
        reader_asset = await unrelated_reader.get(f"/api/v1/assets/{assets[0].id}")
        reader_approval = await unrelated_reader.get(
            f"/api/v1/approvals/{submitted.json()['approval_id']}"
        )
    assert reader_asset.status_code == 200, reader_asset.text
    reader_projection = reader_asset.json()
    assert reader_projection["pending_change"] is not None
    assert (
        reader_projection["pending_change"]["generic_label"] == "protected_asset_change"
    )
    assert reader_projection["pending_change"]["capabilities"] == {
        "can_view_diff": False,
        "can_cancel": False,
    }
    assert reader_projection["pending_change"]["before"] == {}
    assert reader_projection["pending_change"]["after"] == {}
    assert reader_projection["pending_change"]["reason"] == ""
    assert reader_projection["pending_change"]["requested_by_name"] is None
    assert reader_projection["pending_change"]["impacted_resources"] == []
    assert reader_projection["capabilities"]["has_pending_change"] is True
    assert reader_projection["capabilities"]["business_edit_blocked"] is True
    assert reader_projection["capabilities"]["can_update"] is False
    assert reader_approval.status_code in {403, 404}

    async with client_factory(user=test_user_risk_manager) as approver:
        resolver_asset = await approver.get(f"/api/v1/assets/{assets[0].id}")
        assert resolver_asset.status_code == 200, resolver_asset.text
        assert resolver_asset.json()["pending_change"] is not None
    asset_scenario = await db_session.scalar(
        select(ApprovalScenario).where(
            ApprovalScenario.key == "protected_asset_edit"
        )
    )
    assert asset_scenario is not None
    asset_scenario.requires_approval = False
    await db_session.commit()
    async with client_factory(user=test_user_risk_manager) as stale_resolver:
        disabled_projection = await stale_resolver.get(
            f"/api/v1/assets/{assets[0].id}"
        )
    assert disabled_projection.status_code == 200, disabled_projection.text
    assert disabled_projection.json()["pending_change"]["capabilities"] == {
        "can_view_diff": False,
        "can_cancel": False,
    }
    asset_scenario.requires_approval = True
    asset_scenario.approver_roles = ["cro"]
    await db_session.commit()
    async with client_factory(user=test_user_risk_manager) as stale_resolver:
        role_drift_projection = await stale_resolver.get(
            f"/api/v1/assets/{assets[0].id}"
        )
    assert role_drift_projection.status_code == 200, role_drift_projection.text
    assert role_drift_projection.json()["pending_change"]["capabilities"] == {
        "can_view_diff": False,
        "can_cancel": False,
    }
    async with client_factory(user=test_user_cro) as requester:
        requester_after_drift = await requester.get(
            f"/api/v1/assets/{assets[0].id}"
        )
    assert requester_after_drift.status_code == 200, requester_after_drift.text
    assert requester_after_drift.json()["pending_change"]["capabilities"] == {
        "can_view_diff": True,
        "can_cancel": True,
    }
    asset_scenario.approver_roles = ["risk_manager", "cro"]
    await db_session.commit()
    test_user_risk_manager.access_scope = AccessScope.DEPARTMENT
    await db_session.commit()
    async with client_factory(user=test_user_risk_manager) as stale_resolver:
        stale_projection = await stale_resolver.get(f"/api/v1/assets/{assets[0].id}")
    assert stale_projection.status_code == 200, stale_projection.text
    assert stale_projection.json()["pending_change"]["generic_label"] == (
        "protected_asset_change"
    )
    assert stale_projection.json()["pending_change"]["capabilities"] == {
        "can_view_diff": False,
        "can_cancel": False,
    }
    assert stale_projection.json()["capabilities"]["business_edit_blocked"] is True
    test_user_risk_manager.access_scope = AccessScope.GLOBAL
    await db_session.commit()
    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved Asset-only consequence"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_asset_only_protection_still_uses_composite_process_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    asset_payload = _critical_payload(test_user_cro, name="Asset-only protected impact")
    asset_payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created_asset = await requester.post("/api/v1/assets", json=asset_payload)
    asset_id = created_asset.json()["id"]
    process = Process(
        f_code="F-ASSET-ONLY",
        l0_area="Operations",
        l1_process="Non-CIF Process with critical Asset",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        cif_override="no",
    )
    db_session.add(process)
    await db_session.commit()
    scenario.requires_approval = True
    await db_session.commit()
    await _process_scenario(db_session)

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/assets/{asset_id}/process-links",
            json={
                "process_id": process.id,
                "is_primary": True,
                "significance": "Kritická podpora procesu",
                "request_reason": "Review Asset-only protected consequence",
            },
        )

    assert submitted.status_code == 202, submitted.text
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id
                == submitted.json()["approval_id"]
            )
        )
    ).scalar_one()
    assert proposal.derived_impact_snapshot["processes"][0]["before"]["cif"] == "no"
    assert (
        proposal.derived_impact_snapshot["assets"][0]["before"]["resulting_criticality"]
        == "critical"
    )

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved Asset-only protected consequence"},
        )

    assert approved.status_code == 200, approved.text
    assert (
        await db_session.scalar(select(func.count()).select_from(ProcessAssetLink)) == 1
    )


@pytest.mark.asyncio
async def test_new_process_asset_link_derives_proposed_graph_before_asset_policy_decision(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    """A newly linked CIF Process must protect an otherwise ordinary Asset."""
    await _scenario(db_session)
    await _process_scenario(db_session)
    asset_scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    process_scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_process_edit")
    )
    assert asset_scenario is not None and process_scenario is not None
    asset_scenario.requires_approval = False
    process_scenario.requires_approval = False
    await db_session.commit()

    payload = _critical_payload(
        test_user_cro,
        name="Ordinary Asset protected by proposed Process link",
        preliminary_criticality="low",
    )
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created_asset = await requester.post("/api/v1/assets", json=payload)
    assert created_asset.status_code == 201, created_asset.text

    process = Process(
        f_code="F-PROPOSED-GRAPH",
        l0_area="Operations",
        l1_process="New CIF Process link",
        process_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="critical",
        cif_override="yes",
    )
    db_session.add(process)
    await db_session.commit()
    asset_scenario.requires_approval = True
    await db_session.commit()

    asset_id = created_asset.json()["id"]
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/assets/{asset_id}/process-links",
            json={
                "process_id": process.id,
                "is_primary": True,
                "significance": "Kritická podpora procesu",
                "request_reason": "Review proposed Process-to-Asset consequence",
            },
        )

    assert submitted.status_code == 202, submitted.text
    approval_id = submitted.json()["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    assert proposal.scenario_snapshot["key"] == "protected_asset_edit"
    assert proposal.derived_impact_snapshot["assets"] == [
        {
            "resource_id": asset_id,
            "before": {"cif": "no", "resulting_criticality": "low"},
            "after": {"cif": "yes", "resulting_criticality": "critical"},
        }
    ]
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(GovernedMutationImpactLock)
            .where(
                GovernedMutationImpactLock.proposal_id == proposal.id,
                GovernedMutationImpactLock.resource_type == "asset",
                GovernedMutationImpactLock.resource_id == asset_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
        )
        == 1
    )
    assert (
        await db_session.scalar(select(func.count()).select_from(ProcessAssetLink)) == 0
    )

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{approval_id}/approve",
            json={"resolution_notes": "Approved proposed graph consequence"},
        )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert (
        await db_session.scalar(select(func.count()).select_from(ProcessAssetLink)) == 1
    )


@pytest.mark.asyncio
async def test_protected_asset_to_asset_link_is_applied_only_after_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    critical = _critical_payload(test_user_cro, name="Protected dependent Asset")
    critical.pop("request_reason")
    ordinary = _critical_payload(
        test_user_cro,
        name="Ordinary supporting Asset",
        preliminary_criticality="low",
    )
    ordinary.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        first = await requester.post("/api/v1/assets", json=critical)
        second = await requester.post("/api/v1/assets", json=ordinary)
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/assets/{first.json()['id']}/asset-links",
            json={
                "dependent_asset_id": first.json()["id"],
                "supporting_asset_id": second.json()["id"],
                "dependency_type": "Datová",
                "request_reason": "Review protected Asset dependency",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert (
        await db_session.scalar(select(func.count()).select_from(AssetAssetLink)) == 0
    )
    proposal = (
        await db_session.execute(
            select(GovernedMutationProposal).where(
                GovernedMutationProposal.approval_request_id
                == submitted.json()["approval_id"]
            )
        )
    ).scalar_one()
    assert len(proposal.impacted_resources_snapshot) == 2
    relationship_notification = Notification(
        user_id=test_user_cro.id,
        type=NotificationType.GOVERNED_APPROVAL_ACTION_REQUIRED,
        title="Protected Asset relationship request",
        message="Strict correlated relationship envelope",
        resource_type="approval",
        resource_id=submitted.json()["approval_id"],
        is_read=False,
    )
    db_session.add(relationship_notification)
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        relationship_inbox = await requester.get("/api/v1/notifications")
        relationship_unread = await requester.get("/api/v1/notifications/unread/count")
        relationship_read = await requester.post(
            f"/api/v1/notifications/{relationship_notification.id}/read"
        )
    assert relationship_notification.id in {
        item["id"] for item in relationship_inbox.json()["items"]
    }
    assert relationship_unread.json()["count"] == 1
    assert relationship_read.status_code == 200, relationship_read.text
    supporting_asset = await db_session.get(Asset, second.json()["id"])
    assert supporting_asset is not None
    supporting_asset.name = "Live renamed supporting Asset"
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        detail = await requester.get(
            f"/api/v1/approvals/{submitted.json()['approval_id']}"
        )
        pending_asset = await requester.get(f"/api/v1/assets/{first.json()['id']}")
    assert detail.status_code == 200, detail.text
    assert pending_asset.status_code == 200, pending_asset.text
    pending_change = pending_asset.json()["pending_change"]
    assert pending_change["mutation_kind"] == "asset.link.asset.add"
    assert pending_change["relationship_change"] == {
        "target_resource_type": "asset",
        "target_resource_name": "Live renamed supporting Asset",
        "action": "add",
        "before": {},
        "after": {"dependency_type": "Datová", "note": None, "spof": None},
    }
    assert pending_change["impacted_resources"] == [
        {"resource_type": "asset", "resource_name": "Protected dependent Asset"},
        {"resource_type": "asset", "resource_name": "Live renamed supporting Asset"},
    ]
    assert (
        _replay_identifier_keys(
            {
                "relationship_change": pending_change["relationship_change"],
                "impacted_resources": pending_change["impacted_resources"],
                "derived_impact": pending_change["derived_impact"],
            }
        )
        == set()
    )
    governed = detail.json()["governed_mutation"]
    assert governed is not None
    assert [row["resource_name"] for row in governed["derived_impact"]["assets"]] == [
        "Protected dependent Asset",
        "Live renamed supporting Asset",
    ]
    assert governed["relationship_change"]["target_resource_name"] == (
        "Live renamed supporting Asset"
    )
    assert (
        _replay_identifier_keys(
            {
                "before": governed["before"],
                "after": governed["after"],
                "derived_impact": governed["derived_impact"],
                "relationship_change": governed["relationship_change"],
            }
        )
        == set()
    )

    # The proposal remains visible to its requester, but the linked counterpart
    # must be relabelled from live data when that requester later loses access.
    restricted_department = Department(
        name="Restricted counterpart department",
        code="RESTRICTED-COUNTERPART",
        is_active=True,
    )
    db_session.add(restricted_department)
    await db_session.flush()
    original_supporting_department_id = supporting_asset.owning_department_id
    test_user_cro.access_scope = AccessScope.DEPARTMENT
    supporting_asset.business_owner_user_id = test_user_risk_manager.id
    supporting_asset.ict_owner_user_id = test_user_risk_manager.id
    supporting_asset.owning_department_id = restricted_department.id
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        restricted_detail = await requester.get(
            f"/api/v1/approvals/{submitted.json()['approval_id']}"
        )
        restricted_pending_asset = await requester.get(
            f"/api/v1/assets/{first.json()['id']}"
        )
    assert restricted_detail.status_code == 200, restricted_detail.text
    assert restricted_pending_asset.status_code == 200, restricted_pending_asset.text
    restricted_governed = restricted_detail.json()["governed_mutation"]
    assert [
        row["resource_name"] for row in restricted_governed["derived_impact"]["assets"]
    ] == ["Protected dependent Asset", "Restricted Asset"]
    assert restricted_governed["relationship_change"]["target_resource_name"] == (
        "Restricted Asset"
    )
    restricted_pending = restricted_pending_asset.json()["pending_change"]
    assert restricted_pending["relationship_change"]["target_resource_name"] == (
        "Restricted Asset"
    )
    assert restricted_pending["impacted_resources"] == [
        {"resource_type": "asset", "resource_name": "Protected dependent Asset"},
        {"resource_type": "asset", "resource_name": "Restricted Asset"},
    ]

    # Restore the submit-time authority before resolving so this assertion only
    # exercises projection redaction rather than stale-authority expiration.
    test_user_cro.access_scope = AccessScope.GLOBAL
    supporting_asset.business_owner_user_id = test_user_cro.id
    supporting_asset.ict_owner_user_id = test_user_cro.id
    supporting_asset.owning_department_id = original_supporting_department_id
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved Asset dependency"},
        )

    assert approved.status_code == 200, approved.text
    assert (
        await db_session.scalar(select(func.count()).select_from(AssetAssetLink)) == 1
    )
    link_id = await db_session.scalar(select(AssetAssetLink.id))
    async with client_factory(user=test_user_cro) as requester:
        removal = await requester.request(
            "DELETE",
            f"/api/v1/assets/{first.json()['id']}/asset-links/{link_id}",
            json={"request_reason": "Review protected dependency removal"},
        )
    assert removal.status_code == 202, removal.text
    assert (
        await db_session.scalar(select(func.count()).select_from(AssetAssetLink)) == 1
    )
    async with client_factory(user=test_user_risk_manager) as approver:
        removed = await approver.post(
            f"/api/v1/approvals/{removal.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved dependency removal"},
        )
    assert removed.status_code == 200, removed.text
    assert (
        await db_session.scalar(select(func.count()).select_from(AssetAssetLink)) == 0
    )


@pytest.mark.asyncio
async def test_protected_asset_link_accepts_unclassified_counterpart_impact(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    protected = _critical_payload(test_user_cro, name="Protected classified Asset")
    protected.pop("request_reason")
    unclassified = _critical_payload(
        test_user_cro,
        name="Unclassified supporting Asset",
        preliminary_criticality=None,
    )
    unclassified.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        first = await requester.post("/api/v1/assets", json=protected)
        second = await requester.post("/api/v1/assets", json=unclassified)
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/assets/{first.json()['id']}/asset-links",
            json={
                "dependent_asset_id": first.json()["id"],
                "supporting_asset_id": second.json()["id"],
                "dependency_type": "Datová",
                "request_reason": "Review unclassified supporting Asset",
            },
        )
    assert submitted.status_code == 202, submitted.text
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
    )
    assert proposal is not None
    assert proposal.derived_impact_snapshot["assets"][1]["before"] == {
        "cif": "no",
        "resulting_criticality": None,
    }

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved unclassified supporting Asset"},
        )
    assert approved.status_code == 200, approved.text
    assert await db_session.scalar(select(func.count()).select_from(AssetAssetLink)) == 1


@pytest.mark.asyncio
async def test_asset_link_removal_replay_must_match_the_exact_locked_pair(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name == "postgresql":
        pytest.skip(
            "PostgreSQL insert-only trigger correctly forbids corruption fixtures"
        )
    await _scenario(db_session)
    assets = [
        Asset(
            name=f"Exact pair Asset {index}",
            business_owner_user_id=test_user_cro.id,
            ict_owner_user_id=test_user_cro.id,
            owning_department_id=test_user_cro.department_id,
            preliminary_criticality="critical" if index == 1 else "low",
        )
        for index in range(1, 5)
    ]
    db_session.add_all(assets)
    await db_session.flush()
    intended = AssetAssetLink(
        dependent_asset_id=assets[0].id,
        supporting_asset_id=assets[1].id,
        dependency_type="Datová",
    )
    unrelated = AssetAssetLink(
        dependent_asset_id=assets[2].id,
        supporting_asset_id=assets[3].id,
        dependency_type="Datová",
    )
    db_session.add_all([intended, unrelated])
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.request(
            "DELETE",
            f"/api/v1/assets/{assets[0].id}/asset-links/{intended.id}",
            json={"request_reason": "Remove the exact protected pair"},
        )
    assert submitted.status_code == 202, submitted.text
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id
            == submitted.json()["approval_id"]
        )
    )
    assert proposal is not None
    operation = dict(proposal.proposed_changes["operation"])
    operation["before"] = {**operation["before"], "id": unrelated.id}
    await db_session.execute(
        update(GovernedMutationProposal)
        .where(GovernedMutationProposal.id == proposal.id)
        .values(proposed_changes={"operation": operation})
    )
    await db_session.commit()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Tampered pair must expire"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert await db_session.get(AssetAssetLink, intended.id) is not None
    assert await db_session.get(AssetAssetLink, unrelated.id) is not None


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_opposite_direction_asset_link_endpoints_do_not_deadlock(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    """Both endpoint directions acquire the complete Asset pair in ID order."""
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row-lock ordering is authoritative")

    other_department = Department(
        name="Opposite endpoint owner department",
        code="OPPOSITE-ENDPOINT",
        is_active=True,
    )
    db_session.add(other_department)
    await db_session.flush()
    assets = [
        Asset(
            name="Opposite endpoint Asset 1",
            business_owner_user_id=test_user_cro.id,
            ict_owner_user_id=test_user_cro.id,
            owning_department_id=test_user_cro.department_id,
            preliminary_criticality="low",
        ),
        Asset(
            name="Opposite endpoint Asset 2",
            business_owner_user_id=test_user_risk_manager.id,
            ict_owner_user_id=test_user_risk_manager.id,
            owning_department_id=other_department.id,
            preliminary_criticality="low",
        ),
    ]
    db_session.add_all(assets)
    await db_session.commit()
    asset_ids = [asset.id for asset in assets]
    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def independent_db():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            yield session

    async with client_factory(
        user=test_user_cro,
        db_override=independent_db,
        raise_app_exceptions=False,
    ) as requester:
        add_responses = await asyncio.wait_for(
            asyncio.gather(
                requester.post(
                    f"/api/v1/assets/{asset_ids[0]}/asset-links",
                    json={
                        "dependent_asset_id": asset_ids[0],
                        "supporting_asset_id": asset_ids[1],
                        "dependency_type": "Datová",
                    },
                ),
                requester.post(
                    f"/api/v1/assets/{asset_ids[1]}/asset-links",
                    json={
                        "dependent_asset_id": asset_ids[1],
                        "supporting_asset_id": asset_ids[0],
                        "dependency_type": "Datová",
                    },
                ),
            ),
            timeout=10,
        )
    assert [response.status_code for response in add_responses] == [201, 201], [
        response.text for response in add_responses
    ]

    links = list(
        (
            await db_session.execute(select(AssetAssetLink).order_by(AssetAssetLink.id))
        ).scalars()
    )
    assert len(links) == 2
    async with client_factory(
        user=test_user_cro,
        db_override=independent_db,
        raise_app_exceptions=False,
    ) as requester:
        remove_responses = await asyncio.wait_for(
            asyncio.gather(
                requester.request(
                    "DELETE",
                    f"/api/v1/assets/{asset_ids[0]}/asset-links/{links[0].id}",
                    json={},
                ),
                requester.request(
                    "DELETE",
                    f"/api/v1/assets/{asset_ids[1]}/asset-links/{links[1].id}",
                    json={},
                ),
            ),
            timeout=10,
        )
    assert [response.status_code for response in remove_responses] == [204, 204], [
        response.text for response in remove_responses
    ]
    assert (
        await db_session.scalar(select(func.count()).select_from(AssetAssetLink)) == 0
    )


@pytest.mark.asyncio
async def test_protected_asset_to_vendor_link_is_applied_only_after_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    payload = _critical_payload(test_user_cro, name="Protected vendor-dependent Asset")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created_asset = await requester.post("/api/v1/assets", json=payload)
        created_vendor = await requester.post(
            "/api/v1/vendors",
            json={
                "name": "Protected Asset provider",
                "process": "IT",
                "department_id": test_user_cro.department_id,
                "outsourcing_owner_user_id": test_user_cro.id,
            },
        )
    assert created_vendor.status_code == 201, created_vendor.text
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/assets/{created_asset.json()['id']}/vendor-links",
            json={
                "vendor_id": created_vendor.json()["id"],
                "ict_service_code": "S02",
                "request_reason": "Review protected vendor dependency",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert (
        await db_session.scalar(select(func.count()).select_from(AssetVendorLink)) == 0
    )

    async with client_factory(user=test_user_risk_manager) as approver:
        approved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved vendor dependency"},
        )
    assert approved.status_code == 200, approved.text
    assert (
        await db_session.scalar(select(func.count()).select_from(AssetVendorLink)) == 1
    )


@pytest.mark.asyncio
async def test_risk_asset_link_to_protected_asset_waits_for_independent_approval(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    payload = _critical_payload(test_user_cro, name="Risk-governed Asset")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=payload)
    assert created.status_code == 201, created.text
    risk = Risk(
        risk_id_code="R-ASSET-GOV",
        name="Risk-to-Asset governed link",
        process="Operations",
        description="Must not bypass protected Asset governance",
        department_id=test_user_cro.department_id,
        owner_id=test_user_cro.id,
    )
    db_session.add(risk)
    await db_session.commit()
    scenario.requires_approval = True
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/risks/{risk.id}/asset-links",
            json={
                "asset_id": created.json()["id"],
                "request_reason": "Review protected Risk-to-Asset relationship",
            },
        )

    assert submitted.status_code == 202, submitted.text
    assert await db_session.scalar(select(func.count()).select_from(RiskAssetLink)) == 0
    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved protected relationship"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "approved"
    assert await db_session.scalar(select(func.count()).select_from(RiskAssetLink)) == 1
    link_id = await db_session.scalar(select(RiskAssetLink.id))
    async with client_factory(user=test_user_cro) as requester:
        removal = await requester.request(
            "DELETE",
            f"/api/v1/risks/{risk.id}/asset-links/{link_id}",
            json={"request_reason": "Review protected relationship removal"},
        )
    assert removal.status_code == 202, removal.text
    assert await db_session.scalar(select(func.count()).select_from(RiskAssetLink)) == 1
    async with client_factory(user=test_user_risk_manager) as approver:
        removed = await approver.post(
            f"/api/v1/approvals/{removal.json()['approval_id']}/approve",
            json={"resolution_notes": "Approved protected relationship removal"},
        )
    assert removed.status_code == 200, removed.text
    assert removed.json()["status"] == "approved"
    assert await db_session.scalar(select(func.count()).select_from(RiskAssetLink)) == 0


@pytest.mark.asyncio
async def test_risk_asset_approval_expires_after_requester_loses_risk_write_authority(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    payload = _critical_payload(test_user_cro, name="Risk authority Asset")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=payload)
    risk = Risk(
        risk_id_code="R-AUTH-STALE",
        name="Revoked Risk authority",
        process="Operations",
        description="Requester authority changes after submission",
        department_id=test_user_cro.department_id,
        owner_id=test_user_cro.id,
    )
    db_session.add(risk)
    await db_session.commit()
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/risks/{risk.id}/asset-links",
            json={
                "asset_id": created.json()["id"],
                "request_reason": "Review authority",
            },
        )
    revoked_role = Role(
        name="risk_authority_revoked",
        display_name="Risk authority revoked",
        description="No Risk permissions",
    )
    db_session.add(revoked_role)
    await db_session.flush()
    await db_session.execute(
        update(User).where(User.id == test_user_cro.id).values(role_id=revoked_role.id)
    )
    await db_session.commit()
    db_session.expunge_all()

    async with client_factory(user=test_user_risk_manager) as approver:
        resolved = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Requester authority is stale"},
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "expired"
    assert await db_session.scalar(select(func.count()).select_from(RiskAssetLink)) == 0


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_asset_intake_serializes_all_impacted_assets_before_visibility_checks(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL Asset intake row locks are authoritative")
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    created_ids: list[int] = []
    async with client_factory(user=test_user_cro) as requester:
        for suffix in ("primary", "supporting"):
            payload = _critical_payload(test_user_cro, name=f"Intake race {suffix}")
            payload.pop("request_reason")
            created = await requester.post("/api/v1/assets", json=payload)
            assert created.status_code == 201, created.text
            created_ids.append(created.json()["id"])
    scenario.requires_approval = True
    await db_session.commit()

    from app.services._governed_mutations import asset_mutations

    visibility_check_reached = asyncio.Event()
    release_submission = asyncio.Event()
    original_check = asset_mutations.assert_no_pending_asset_mutation

    async def paused_visibility_check(*args, **kwargs):
        result = await original_check(*args, **kwargs)
        if not visibility_check_reached.is_set():
            visibility_check_reached.set()
            await release_submission.wait()
        return result

    monkeypatch.setattr(
        asset_mutations,
        "assert_no_pending_asset_mutation",
        paused_visibility_check,
    )
    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def submit_relationship():
        async with session_maker() as session:
            assets = list(
                (
                    await session.execute(
                        select(Asset)
                        .where(Asset.id.in_(created_ids))
                        .order_by(Asset.id)
                    )
                ).scalars()
            )
            requester = await session.get(User, test_user_cro.id)
            assert requester is not None
            await session.refresh(requester, ["role"])
            return await asset_mutations.submit_asset_link_mutation_if_required(
                db=session,
                asset=assets[0],
                impacted_assets=[assets[1], assets[0], assets[1]],
                operation={
                    "relationship_type": "asset",
                    "action": "add",
                    "before": None,
                    "after": {
                        "dependent_asset_id": assets[0].id,
                        "supporting_asset_id": assets[1].id,
                        "dependency_type": "Datová",
                    },
                },
                current_user=requester,
                request_reason="Serialize every impacted Asset before intake visibility",
            )

    async def direct_mutation():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            await session.execute(
                update(Asset)
                .where(Asset.id == created_ids[1])
                .values(
                    notes="Concurrent direct mutation",
                    governance_version=Asset.governance_version + 1,
                )
            )
            await session.commit()

    submitting = asyncio.create_task(submit_relationship())
    await asyncio.wait_for(visibility_check_reached.wait(), timeout=5)
    racing_mutation = asyncio.create_task(direct_mutation())
    await asyncio.sleep(0.15)
    assert not racing_mutation.done()
    release_submission.set()
    queued, _ = await asyncio.wait_for(
        asyncio.gather(submitting, racing_mutation),
        timeout=10,
    )
    assert queued is not None
    approval_id = json.loads(queued.body)["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    locks = list(
        (
            await db_session.execute(
                select(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.proposal_id == proposal.id)
                .order_by(GovernedMutationImpactLock.resource_id)
            )
        ).scalars()
    )
    assert [lock.resource_id for lock in locks] == sorted(created_ids)
    assert [lock.base_governance_version for lock in locks] == [1, 1]


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_asset_archive_intake_serializes_before_pending_and_derivation(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL Asset archive intake row lock is authoritative")
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    payload = _critical_payload(test_user_cro, name="Archive intake race")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=payload)
    assert created.status_code == 201, created.text
    asset_id = created.json()["id"]
    scenario.requires_approval = True
    await db_session.commit()

    from app.services._governed_mutations import asset_mutations

    visibility_check_reached = asyncio.Event()
    release_submission = asyncio.Event()
    original_check = asset_mutations.assert_no_pending_asset_mutation

    async def paused_visibility_check(*args, **kwargs):
        result = await original_check(*args, **kwargs)
        visibility_check_reached.set()
        await release_submission.wait()
        return result

    monkeypatch.setattr(
        asset_mutations,
        "assert_no_pending_asset_mutation",
        paused_visibility_check,
    )
    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def submit_archive():
        async with session_maker() as session:
            asset = await session.get(Asset, asset_id)
            requester = await session.get(User, test_user_cro.id)
            assert asset is not None and requester is not None
            await session.refresh(requester, ["role"])
            return await asset_mutations.submit_asset_archive_if_required(
                db=session,
                asset=asset,
                current_user=requester,
                request_reason="Archive only after independent review",
            )

    async def direct_edit():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            await session.execute(
                update(Asset)
                .where(Asset.id == asset_id)
                .values(
                    notes="Concurrent direct edit",
                    governance_version=Asset.governance_version + 1,
                )
            )
            await session.commit()

    submitting = asyncio.create_task(submit_archive())
    await asyncio.wait_for(visibility_check_reached.wait(), timeout=5)
    racing_edit = asyncio.create_task(direct_edit())
    await asyncio.sleep(0.15)
    assert not racing_edit.done()
    release_submission.set()
    queued, _ = await asyncio.wait_for(
        asyncio.gather(submitting, racing_edit), timeout=10
    )
    assert queued is not None
    approval_id = json.loads(queued.body)["approval_id"]
    proposal = await db_session.scalar(
        select(GovernedMutationProposal).where(
            GovernedMutationProposal.approval_request_id == approval_id
        )
    )
    assert proposal is not None
    assert proposal.base_versions == {"asset": 1}
    lock = await db_session.scalar(
        select(GovernedMutationImpactLock).where(
            GovernedMutationImpactLock.proposal_id == proposal.id
        )
    )
    assert lock is not None and lock.base_governance_version == 1


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_identical_rowless_asset_creations_serialize_to_one_pending(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL governed Asset creation locks are authoritative")
    await _scenario(db_session)
    from app.services._governed_mutations import asset_mutations

    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def independent_db_session():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            yield session

    first_checked = asyncio.Event()
    release_first = asyncio.Event()
    second_lock_attempted = asyncio.Event()
    original_duplicate_check = asset_mutations._assert_no_duplicate_asset_creation
    original_name_lock = asset_mutations.acquire_asset_creation_name_lock
    check_calls = 0
    lock_attempts = 0

    async def observed_name_lock(*args, **kwargs):
        nonlocal lock_attempts
        lock_attempts += 1
        if lock_attempts == 2:
            second_lock_attempted.set()
        return await original_name_lock(*args, **kwargs)

    async def paused_first_duplicate_check(*args, **kwargs):
        nonlocal check_calls
        await original_duplicate_check(*args, **kwargs)
        check_calls += 1
        if check_calls == 1:
            first_checked.set()
            await release_first.wait()

    monkeypatch.setattr(
        asset_mutations,
        "_assert_no_duplicate_asset_creation",
        paused_first_duplicate_check,
    )
    monkeypatch.setattr(
        asset_mutations,
        "acquire_asset_creation_name_lock",
        observed_name_lock,
    )
    first_payload = _critical_payload(
        test_user_cro,
        name="Concurrent identical governed Asset",
    )
    second_payload = _critical_payload(
        test_user_cro,
        name="Concurrent identical governed Asset",
    )
    async with (
        client_factory(
            user=test_user_cro, db_override=independent_db_session
        ) as first_client,
        client_factory(
            user=test_user_cro, db_override=independent_db_session
        ) as second_client,
    ):
        first = asyncio.create_task(
            first_client.post("/api/v1/assets", json=first_payload)
        )
        await asyncio.wait_for(first_checked.wait(), timeout=5)
        second = asyncio.create_task(
            second_client.post("/api/v1/assets", json=second_payload)
        )
        await asyncio.wait_for(second_lock_attempted.wait(), timeout=5)
        assert lock_attempts == 2
        assert not second.done()
        assert check_calls == 1
        release_first.set()
        first_result, second_result = await asyncio.wait_for(
            asyncio.gather(first, second),
            timeout=10,
        )

    assert first_result.status_code == 202, first_result.text
    assert second_result.status_code == 409, second_result.text
    assert second_result.json()["detail"]["code"] == "asset_pending_mutation"
    pending = await db_session.scalar(
        select(func.count())
        .select_from(ApprovalRequest)
        .where(
            ApprovalRequest.resource_type == "asset",
            ApprovalRequest.resource_name == "Concurrent identical governed Asset",
            ApprovalRequest.status == ApprovalStatus.PENDING,
        )
    )
    assert pending == 1


@pytest.mark.postgres
@pytest.mark.asyncio
@pytest.mark.parametrize("resolution_action", ["approve", "reject"])
@pytest.mark.parametrize(
    "race_target",
    [
        "requester_role",
        "requester_scope",
        "resolver_role",
        "resolver_scope",
        "scenario",
    ],
)
async def test_postgres_asset_resolution_serializes_live_authority_and_scenario_races(
    race_target: str,
    resolution_action: str,
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL authority row locks are authoritative")
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/assets",
            json=_critical_payload(
                test_user_cro,
                name=f"Forced authority race {race_target}",
            ),
        )
    assert submitted.status_code == 202, submitted.text

    from app.services._governed_mutations import asset_resolution_policy

    lock_reached = asyncio.Event()
    release_resolution = asyncio.Event()
    if race_target == "scenario":
        original_lock = asset_resolution_policy.load_fixed_asset_scenario_for_update

        async def paused_lock(*args, **kwargs):
            scenario = await original_lock(*args, **kwargs)
            lock_reached.set()
            await release_resolution.wait()
            return scenario

        monkeypatch.setattr(
            asset_resolution_policy,
            "load_fixed_asset_scenario_for_update",
            paused_lock,
        )
    else:
        original_lock = asset_resolution_policy._lock_asset_resolution_actors

        async def paused_lock(*args, **kwargs):
            actors = await original_lock(*args, **kwargs)
            lock_reached.set()
            await release_resolution.wait()
            return actors

        monkeypatch.setattr(
            asset_resolution_policy,
            "_lock_asset_resolution_actors",
            paused_lock,
        )

    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def mutate_authority() -> None:
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            if race_target == "scenario":
                await session.execute(
                    update(ApprovalScenario)
                    .where(ApprovalScenario.key == "protected_asset_edit")
                    .values(requires_approval=False)
                )
            else:
                actor_id = (
                    test_user_cro.id
                    if race_target.startswith("requester")
                    else test_user_risk_manager.id
                )
                values = (
                    {"role_id": test_user_employee.role_id}
                    if race_target.endswith("role")
                    else {"access_scope": AccessScope.DEPARTMENT}
                )
                await session.execute(
                    update(User).where(User.id == actor_id).values(**values)
                )
            await session.commit()

    async with client_factory(user=test_user_risk_manager) as resolver:
        resolving = asyncio.create_task(
            resolver.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/{resolution_action}",
                # approve and reject must share the exact same canonical locks
                json={"resolution_notes": f"Serialize {race_target}"},
            )
        )
        await asyncio.wait_for(lock_reached.wait(), timeout=5)
        racing_update = asyncio.create_task(mutate_authority())
        await asyncio.sleep(0.15)
        assert not racing_update.done()
        release_resolution.set()
        resolved, _ = await asyncio.wait_for(
            asyncio.gather(resolving, racing_update),
            timeout=10,
        )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == (
        "approved" if resolution_action == "approve" else "rejected"
    )


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_risk_asset_double_resolution_serializes_once(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row-lock serialization is authoritative")
    await _scenario(db_session)
    scenario = await db_session.scalar(
        select(ApprovalScenario).where(ApprovalScenario.key == "protected_asset_edit")
    )
    assert scenario is not None
    scenario.requires_approval = False
    await db_session.commit()
    payload = _critical_payload(test_user_cro, name="Concurrent Risk Asset")
    payload.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=payload)
    risk = Risk(
        risk_id_code="R-CONCURRENT-ASSET",
        name="Concurrent governed link",
        process="Operations",
        description="Concurrent resolution serialization",
        department_id=test_user_cro.department_id,
        owner_id=test_user_cro.id,
    )
    db_session.add(risk)
    await db_session.commit()
    scenario.requires_approval = True
    await db_session.commit()
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            f"/api/v1/risks/{risk.id}/asset-links",
            json={
                "asset_id": created.json()["id"],
                "request_reason": "Serialize approval",
            },
        )

    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def independent_db_session():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '2s'"))
            yield session

    async with (
        client_factory(
            user=test_user_risk_manager, db_override=independent_db_session
        ) as first,
        client_factory(
            user=test_user_risk_manager, db_override=independent_db_session
        ) as second,
    ):
        results = await asyncio.wait_for(
            asyncio.gather(
                first.post(
                    f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
                    json={"resolution_notes": "First concurrent resolver"},
                ),
                second.post(
                    f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
                    json={"resolution_notes": "Second concurrent resolver"},
                ),
            ),
            timeout=5,
        )
    assert sorted(result.status_code for result in results) == [200, 400]
    assert await db_session.scalar(select(func.count()).select_from(RiskAssetLink)) == 1


@pytest.mark.postgres
@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["add", "remove"])
async def test_postgres_unprotected_risk_asset_endpoints_serialize_exact_link_state(
    operation: str,
    client_factory,
    db_session: AsyncSession,
    async_engine,
    test_user_cro: User,
) -> None:
    """The Asset row lock must guard the final Risk↔Asset existence decision."""
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row-lock serialization is authoritative")
    asset = Asset(
        name=f"Concurrent ordinary Risk Asset {operation}",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="low",
    )
    risk = Risk(
        risk_id_code=f"R-ORDINARY-{operation.upper()}",
        name=f"Concurrent ordinary {operation}",
        process="Operations",
        description="Exact post-lock relationship state",
        department_id=test_user_cro.department_id,
        owner_id=test_user_cro.id,
    )
    db_session.add_all([asset, risk])
    await db_session.flush()
    link = None
    if operation == "remove":
        link = RiskAssetLink(risk_id=risk.id, asset_id=asset.id)
        db_session.add(link)
    await db_session.commit()
    asset_id = asset.id
    risk_id = risk.id
    link_id = link.id if link is not None else None
    initial_version = asset.governance_version
    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def independent_db_session():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            yield session

    async with (
        client_factory(
            user=test_user_cro,
            db_override=independent_db_session,
            raise_app_exceptions=False,
        ) as first,
        client_factory(
            user=test_user_cro,
            db_override=independent_db_session,
            raise_app_exceptions=False,
        ) as second,
    ):
        if operation == "add":
            responses = await asyncio.wait_for(
                asyncio.gather(
                    first.post(
                        f"/api/v1/risks/{risk_id}/asset-links",
                        json={"asset_id": asset_id},
                    ),
                    second.post(
                        f"/api/v1/risks/{risk_id}/asset-links",
                        json={"asset_id": asset_id},
                    ),
                ),
                timeout=10,
            )
        else:
            assert link_id is not None
            responses = await asyncio.wait_for(
                asyncio.gather(
                    first.request(
                        "DELETE",
                        f"/api/v1/risks/{risk_id}/asset-links/{link_id}",
                        json={},
                    ),
                    second.request(
                        "DELETE",
                        f"/api/v1/risks/{risk_id}/asset-links/{link_id}",
                        json={},
                    ),
                ),
                timeout=10,
            )
    statuses = sorted(response.status_code for response in responses)
    assert 500 not in statuses, [response.text for response in responses]
    assert statuses == ([201, 400] if operation == "add" else [204, 404])
    if operation == "add":
        rejected = next(
            response for response in responses if response.status_code == 400
        )
        assert rejected.json() == {"detail": "Link already exists"}
    remaining = await db_session.scalar(
        select(func.count())
        .select_from(RiskAssetLink)
        .where(
            RiskAssetLink.risk_id == risk_id,
            RiskAssetLink.asset_id == asset_id,
        )
    )
    assert remaining == (1 if operation == "add" else 0)
    await db_session.refresh(asset)
    assert asset.governance_version == initial_version + 1


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_risk_asset_link_rejects_risk_archived_while_waiting_after_asset_lock(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_cro: User,
) -> None:
    """A Risk archived after the Asset lock cannot receive a link or proposal."""
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row-lock serialization is authoritative")
    await _scenario(db_session)
    asset = Asset(
        name="Archive-race governed Asset",
        business_owner_user_id=test_user_cro.id,
        ict_owner_user_id=test_user_cro.id,
        owning_department_id=test_user_cro.department_id,
        preliminary_criticality="critical",
    )
    risk = Risk(
        risk_id_code="R-ASSET-ARCHIVE-RACE",
        name="Archive-race Risk",
        process="Operations",
        description="Risk archived after the governed mutation locks its Asset",
        department_id=test_user_cro.department_id,
        owner_id=test_user_cro.id,
    )
    db_session.add_all([asset, risk])
    await db_session.commit()
    asset_id = asset.id
    risk_id = risk.id

    from app.services._governed_mutations import asset_mutations

    original_lock = asset_mutations._lock_impacted_assets_for_submission
    asset_locked = asyncio.Event()
    release_mutation = asyncio.Event()

    async def pause_after_asset_lock(*args, **kwargs):
        locked = await original_lock(*args, **kwargs)
        asset_locked.set()
        await release_mutation.wait()
        return locked

    monkeypatch.setattr(
        asset_mutations,
        "_lock_impacted_assets_for_submission",
        pause_after_asset_lock,
    )

    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def independent_db_session():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            yield session

    async with (
        client_factory(
            user=test_user_cro,
            db_override=independent_db_session,
            raise_app_exceptions=False,
        ) as mutation_client,
        client_factory(
            user=test_user_cro,
            db_override=independent_db_session,
            raise_app_exceptions=False,
        ) as archive_client,
    ):
        mutation = asyncio.create_task(
            mutation_client.post(
                f"/api/v1/risks/{risk_id}/asset-links",
                json={
                    "asset_id": asset_id,
                    "request_reason": "Archive-race proof",
                },
            )
        )
        await asyncio.wait_for(asset_locked.wait(), timeout=5)
        archived = await archive_client.delete(
            f"/api/v1/risks/{risk_id}",
            params={"reason": "Archive during Asset mutation"},
        )
        assert archived.status_code == 204, archived.text
        release_mutation.set()
        rejected = await asyncio.wait_for(mutation, timeout=10)

    assert rejected.status_code == 409, rejected.text
    assert rejected.json() == {
        "detail": "Cannot mutate an Asset link from an archived Risk"
    }
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(RiskAssetLink)
            .where(
                RiskAssetLink.risk_id == risk_id,
                RiskAssetLink.asset_id == asset_id,
            )
        )
        == 0
    )
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(ApprovalRequest)
            .where(
                ApprovalRequest.resource_type == "asset",
                ApprovalRequest.resource_id == asset_id,
                ApprovalRequest.status == ApprovalStatus.PENDING,
            )
        )
        == 0
    )


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_asset_resolution_rolls_back_operational_and_terminal_state_together(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL transaction rollback is authoritative")
    direct = _critical_payload(test_user_cro, preliminary_criticality="low")
    direct.pop("request_reason")
    async with client_factory(user=test_user_cro) as requester:
        created = await requester.post("/api/v1/assets", json=direct)
    await _scenario(db_session)
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.patch(
            f"/api/v1/assets/{created.json()['id']}",
            json={
                "preliminary_criticality": "critical",
                "request_reason": "Rollback proof",
            },
        )

    from app.services._governed_mutations import asset_mutations

    async def fail_before_commit(_db, *, boundary: str) -> None:
        if boundary == "governed_mutation.asset.resolve":
            raise RuntimeError("forced resolution commit failure")
        await asset_mutations._original_commit_service_boundary(_db, boundary=boundary)

    monkeypatch.setattr(
        asset_mutations,
        "_original_commit_service_boundary",
        asset_mutations.commit_service_boundary,
        raising=False,
    )
    monkeypatch.setattr(asset_mutations, "commit_service_boundary", fail_before_commit)
    async with client_factory(user=test_user_risk_manager) as approver:
        failed = await approver.post(
            f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
            json={"resolution_notes": "Forced rollback"},
        )
    assert failed.status_code == 500, failed.text

    session_maker = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_maker() as verification:
        asset = await verification.get(Asset, created.json()["id"])
        approval = await verification.get(
            ApprovalRequest, submitted.json()["approval_id"]
        )
        lock = await verification.scalar(
            select(GovernedMutationImpactLock).where(
                GovernedMutationImpactLock.proposal_id
                == select(GovernedMutationProposal.id)
                .where(
                    GovernedMutationProposal.approval_request_id
                    == submitted.json()["approval_id"]
                )
                .scalar_subquery()
            )
        )
    assert asset is not None and asset.preliminary_criticality == "low"
    assert approval is not None and approval.status == ApprovalStatus.PENDING
    assert lock is not None and lock.released_at is None and lock.release_reason is None
