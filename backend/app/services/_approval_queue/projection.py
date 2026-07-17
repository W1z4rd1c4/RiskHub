from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_display import approval_resource_label
from app.models import ApprovalRequest, Process
from app.models.user import User
from app.schemas.approval_request import ApprovalRequestCapabilities, ApprovalRequestRead
from app.services._governed_mutations.process_identity import (
    InvalidGovernedProcessIdentity,
    strict_governed_process_identity,
)
from app.services._governed_mutations.projection import (
    actor_safe_pending_changes,
    actor_safe_process_snapshots,
)
from app.services.approval_scenario_policy import (
    can_resolve_process_approval,
    can_view_governed_process_snapshot,
)
from app.services.authorization_capabilities import approval_capabilities

from .contracts import ApprovalQueuePage, ApprovalQueueProjection
from .logging import queue_logger

try:
    from prometheus_client import Counter
except ModuleNotFoundError:  # pragma: no cover - metrics dependency is optional in tests
    Counter = None


class _NoopCounter:
    def inc(self, _amount: int = 1) -> None:
        return None

    def collect(self):
        return ()


APPROVAL_QUEUE_PROJECTION_SKIPPED_TOTAL = (
    Counter(
        "riskhub_approval_queue_projection_skipped_total",
        "Number of approval queue rows skipped because their stored payload could not be projected.",
    )
    if Counter is not None
    else _NoopCounter()
)


def build_approval_read(
    approval: ApprovalRequest,
    current_user: User,
    capabilities: ApprovalRequestCapabilities | None = None,
    *,
    can_view_governed_snapshot: bool = False,
    can_view_governed_references: bool = False,
    governed_resolver: bool = False,
) -> ApprovalRequestRead:
    proposal = approval.governed_mutation_proposal
    identity = strict_governed_process_identity(proposal)
    if proposal is not None and identity is None:
        raise InvalidGovernedProcessIdentity(
            "Unsupported governed mutation proposal"
        )
    capabilities = capabilities or approval_capabilities(
        approval=approval,
        current_user=current_user,
        governed_identity=identity,
        governed_resolver=governed_resolver,
    )
    can_expose_snapshot = bool(
        identity is not None
        and can_view_governed_snapshot
        and capabilities.can_view_pending_changes
    )
    if identity is not None and not can_expose_snapshot:
        capabilities = capabilities.model_copy(
            update={"can_view_pending_changes": False}
        )
    pending_changes = approval.pending_changes if identity is None else None
    governed_mutation = None
    if can_expose_snapshot:
        assert proposal is not None
        before, after = actor_safe_process_snapshots(
            proposal,
            can_view_proposed_references=can_view_governed_references,
        )
        pending_changes = actor_safe_pending_changes(
            identity.pending_changes,
            before=before,
            after=after,
        )
        governed_mutation = {
            "proposal_id": proposal.proposal_id,
            "proposal_version": proposal.proposal_version,
            "mutation_kind": proposal.mutation_kind,
            "before": before,
            "after": after,
            "derived_impact": proposal.derived_impact_snapshot,
            "impacted_resources": [
                {
                    "resource_type": str(
                        resource.get("resource_type") or "resource"
                    ),
                    "resource_name": (
                        str(resource.get("resource_name") or "").strip()
                        or f"Unknown {str(resource.get('resource_type') or 'resource')}"
                    ),
                }
                for resource in proposal.impacted_resources_snapshot
                if isinstance(resource, dict)
            ],
        }

    requester = proposal.requested_by if identity is not None else approval.requested_by
    resource_type = (
        identity.primary_resource_type
        if identity is not None
        else approval.resource_type.value
    )
    resource_id = (
        identity.primary_resource_id if identity is not None else approval.resource_id
    )
    resource_name = (
        identity.primary_resource_name
        if identity is not None
        else approval_resource_label(approval)
    )
    action_type = (
        identity.action_type.value
        if identity is not None
        else (approval.action_type.value if approval.action_type else "delete")
    )
    requested_by_id = (
        identity.requested_by_id if identity is not None else approval.requested_by_id
    )
    return ApprovalRequestRead.model_validate(
        {
            "id": approval.id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action_type": action_type,
            "pending_changes": pending_changes,
            "status": approval.status.value.lower(),
            "reason": approval.reason,
            "requested_by_id": requested_by_id,
            "requested_by_name": requester.name if requester else None,
            "requested_by_email": requester.email if requester else None,
            "resolved_by_id": approval.resolved_by_id,
            "resolved_by_name": approval.resolved_by.name if approval.resolved_by else None,
            "resolved_at": approval.resolved_at,
            "resolution_notes": approval.resolution_notes,
            "created_at": approval.created_at,
            "resource_name": resource_name,
            "can_approve": capabilities.can_approve,
            "can_reject": capabilities.can_reject,
            "capabilities": capabilities,
            "governed_mutation": governed_mutation,
        }
    )


async def governed_process_snapshot_access_ids(
    db: AsyncSession,
    *,
    approvals: list[ApprovalRequest],
    current_user: User,
) -> set[int]:
    identities = []
    for approval in approvals:
        try:
            identity = strict_governed_process_identity(
                approval.governed_mutation_proposal
            )
        except InvalidGovernedProcessIdentity:
            continue
        if identity is not None:
            identities.append((approval, identity))
    process_ids = {
        identity.primary_resource_id for _, identity in identities
    }
    if not process_ids:
        return set()
    processes = {
        process.id: process
        for process in (
            await db.execute(select(Process).where(Process.id.in_(process_ids)))
        )
        .scalars()
        .all()
    }
    access_ids: set[int] = set()
    for approval, identity in identities:
        process = processes.get(identity.primary_resource_id)
        if process is not None:
            if can_view_governed_process_snapshot(
                current_user,
                process,
                requester_id=identity.requested_by_id,
                configured_roles=identity.approver_roles,
            ):
                access_ids.add(approval.id)
    return access_ids


async def governed_process_resolver_ids(
    db: AsyncSession,
    *,
    approvals: list[ApprovalRequest],
    current_user: User,
) -> set[int]:
    identities = []
    for approval in approvals:
        try:
            identity = strict_governed_process_identity(
                approval.governed_mutation_proposal
            )
        except InvalidGovernedProcessIdentity:
            continue
        if identity is not None:
            identities.append((approval, identity))
    process_ids = {identity.primary_resource_id for _, identity in identities}
    processes = {
        process.id: process
        for process in (
            await db.execute(select(Process).where(Process.id.in_(process_ids)))
        )
        .scalars()
        .all()
    }
    return {
        approval.id
        for approval, identity in identities
        if (process := processes.get(identity.primary_resource_id)) is not None
        and can_resolve_process_approval(
            current_user,
            process,
            requester_id=identity.requested_by_id,
            configured_roles=identity.approver_roles,
        )
    }


async def governed_process_response_access(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    current_user: User,
) -> tuple[bool, bool]:
    identity = strict_governed_process_identity(
        approval.governed_mutation_proposal
    )
    if identity is None:
        return False, False
    process = await db.get(Process, identity.primary_resource_id)
    if process is None:
        return False, False
    resolver = can_resolve_process_approval(
        current_user,
        process,
        requester_id=identity.requested_by_id,
        configured_roles=identity.approver_roles,
    )
    return (
        can_view_governed_process_snapshot(
            current_user,
            process,
            requester_id=identity.requested_by_id,
            configured_roles=identity.approver_roles,
        ),
        resolver,
    )


def project_approval_read(
    approval: ApprovalRequest,
    current_user: User,
    *,
    governed_snapshot_access_ids: set[int] | None = None,
    governed_resolver_ids: set[int] | None = None,
    can_view_governed_references: bool = False,
):
    try:
        return (
            build_approval_read(
                approval,
                current_user,
                can_view_governed_snapshot=(
                    governed_snapshot_access_ids is not None
                    and approval.id in governed_snapshot_access_ids
                ),
                can_view_governed_references=can_view_governed_references,
                governed_resolver=(
                    governed_resolver_ids is not None
                    and approval.id in governed_resolver_ids
                ),
            ),
            None,
        )
    except Exception as exc:
        APPROVAL_QUEUE_PROJECTION_SKIPPED_TOTAL.inc()
        queue_logger.exception(
            "approval_queue_projection_skipped",
            extra={
                "approval_request_id": approval.id,
                "operation": "approval_queue_projection",
            },
        )
        return None, str(exc)


def project_approval_queue_item(
    approval: ApprovalRequest,
    current_user: User,
    *,
    governed_snapshot_access_ids: set[int] | None = None,
    governed_resolver_ids: set[int] | None = None,
    can_view_governed_references: bool = False,
) -> ApprovalQueueProjection:
    item, skipped_reason = project_approval_read(
        approval,
        current_user,
        governed_snapshot_access_ids=governed_snapshot_access_ids,
        governed_resolver_ids=governed_resolver_ids,
        can_view_governed_references=can_view_governed_references,
    )
    return ApprovalQueueProjection(approval=approval, item=item, skipped_reason=skipped_reason)


def approval_queue_page(
    *,
    approvals: list[ApprovalRequest],
    total: int,
    skip: int,
    limit: int,
    current_user: User,
    governed_snapshot_access_ids: set[int] | None = None,
    governed_resolver_ids: set[int] | None = None,
    can_view_governed_references: bool = False,
) -> ApprovalQueuePage:
    projections = [
        project_approval_queue_item(
            approval,
            current_user,
            governed_snapshot_access_ids=governed_snapshot_access_ids,
            governed_resolver_ids=governed_resolver_ids,
            can_view_governed_references=can_view_governed_references,
        )
        for approval in approvals
    ]
    items = [projection.item for projection in projections if projection.item is not None]
    return ApprovalQueuePage(
        items=items,
        total=total,
        skip=skip,
        limit=limit,
        skipped_corrupt_payloads=sum(1 for projection in projections if projection.item is None),
    )
