"""Intake for governed Threat Steward accountability changes."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import build_approval_queued_response
from app.core.audit import governed_mutation as audit_governed
from app.core.exceptions import ConflictError, ValidationError
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Permission,
    Role,
    RolePermission,
    Threat,
    User,
)
from app.models.user import AccessScope
from app.services.outbox import OutboxService
from app.services.transaction_boundary import commit_service_boundary

from .fixed_accountability_policy import (
    ACCOUNTABILITY_SCENARIO_KEY,
    load_fixed_accountability_scenario_for_update,
    validated_fixed_accountability_roles,
)
from .threat_identity import THREAT_EDIT_KIND


def _required_reason(value: str | None) -> str:
    reason = (value or "").strip()
    if not reason:
        raise ValidationError(
            "A request reason is mandatory for a Threat Steward reassignment",
            code="governed_mutation_reason_required",
            status_code=422,
        )
    return reason


async def _has_independent_approver(
    db: AsyncSession,
    *,
    requester_id: int,
    roles: list[str],
) -> bool:
    return (
        await db.scalar(
            select(User.id)
            .join(Role, Role.id == User.role_id)
            .join(RolePermission, RolePermission.role_id == Role.id)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(
                User.is_active.is_(True),
                User.id != requester_id,
                User.access_scope == AccessScope.GLOBAL,
                Role.is_active.is_(True),
                Role.name.in_(roles),
                or_(Permission.resource == "approvals", Permission.resource == "*"),
                or_(Permission.action == "write", Permission.action == "*"),
            )
            .limit(1)
        )
    ) is not None


async def assert_no_pending_threat_mutation(
    db: AsyncSession,
    *,
    threat_id: int,
) -> None:
    pending = await db.scalar(
        select(GovernedMutationImpactLock.id)
        .where(
            GovernedMutationImpactLock.resource_type == "threat",
            GovernedMutationImpactLock.resource_id == threat_id,
            GovernedMutationImpactLock.released_at.is_(None),
        )
        .limit(1)
    )
    if pending is not None:
        raise ConflictError(
            "A governed Threat change is already pending",
            code="threat_pending_mutation",
        )


async def submit_threat_steward_edit_if_required(
    *,
    db: AsyncSession,
    threat: Threat,
    current_user: User,
    new_steward: User,
    request_reason: str | None,
    orphan_resolution: tuple[int, int] | None = None,
) -> object | None:
    await assert_no_pending_threat_mutation(db, threat_id=threat.id)
    if threat.threat_steward_user_id == new_steward.id:
        return None
    scenario = await load_fixed_accountability_scenario_for_update(db)
    if not scenario.requires_approval:
        return None
    reason = _required_reason(request_reason)
    roles = validated_fixed_accountability_roles(scenario)
    if not await _has_independent_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
    ):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    current_steward = threat.threat_steward
    old_label = current_steward.name if current_steward else "Unknown user"
    pending = {
        "threat_steward": {
            "old": old_label,
            "new": new_steward.name,
        }
    }
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.THREAT,
        resource_id=threat.id,
        resource_name=threat.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending,
        scenario_key=ACCOUNTABILITY_SCENARIO_KEY,
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    await db.flush()
    impact = {
        "resource_type": "threat",
        "resource_id": threat.id,
        "resource_name": threat.name,
        "base_governance_version": threat.governance_version,
    }
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind=THREAT_EDIT_KIND,
        primary_resource_type="threat",
        primary_resource_id=threat.id,
        primary_resource_name=threat.name,
        scenario_snapshot={
            "key": ACCOUNTABILITY_SCENARIO_KEY,
            "requires_approval": True,
            "approver_roles": roles,
        },
        base_versions={"threat": threat.governance_version},
        before_snapshot={"threat_steward": old_label},
        after_snapshot={"threat_steward": new_steward.name},
        derived_impact_snapshot={"before": {}, "after": {}},
        proposed_changes={
            "before": {
                "threat_steward_user_id": threat.threat_steward_user_id,
            },
            "after": {"threat_steward_user_id": new_steward.id},
        },
        impacted_resources_snapshot=[impact],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
    db.add(
        GovernedMutationImpactLock(
            proposal_id=proposal.id,
            resource_type="threat",
            resource_id=threat.id,
            base_governance_version=threat.governance_version,
        )
    )
    if orphan_resolution is not None:
        orphan_id, previous_owner_id = orphan_resolution
        db.add(
            GovernedMutationImpactLock(
                proposal_id=proposal.id,
                resource_type="orphaned_item",
                resource_id=orphan_id,
                base_governance_version=previous_owner_id,
            )
        )
    await audit_governed.proposal_submitted(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        department_id=current_user.department_id,
        changes=pending,
    )
    await OutboxService.enqueue(
        db,
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=f"approval.request_created:{approval.id}:pending",
        payload={"approval_id": approval.id},
    )
    await commit_service_boundary(
        db,
        boundary="governed_mutation.threat.edit.submit",
    )
    return build_approval_queued_response(
        message="Threat Steward reassignment submitted for independent approval",
        approval_id=approval.id,
        action_type=ApprovalActionType.EDIT.value,
        pending_fields=["threat_steward"],
        pending_changes=pending,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


__all__ = [
    "assert_no_pending_threat_mutation",
    "submit_threat_steward_edit_if_required",
]
