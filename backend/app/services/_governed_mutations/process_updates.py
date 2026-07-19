"""Governed Process edit intake for ADR-016."""

from __future__ import annotations

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import build_approval_queued_response
from app.core.audit import governed_mutation as audit_governed
from app.core.exceptions import ConflictError, ValidationError
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Process,
    User,
)
from app.services._ict_register_lifecycle.projection import (
    load_governed_process_derived_blocks,
)
from app.services.outbox import OutboxService
from app.services.transaction_boundary import commit_service_boundary

from .fixed_policy import (
    SCENARIO_KEY,
    load_fixed_process_scenario_for_update,
    validated_fixed_process_roles,
)
from .process_identity import (
    canonical_process_display_name,
    new_governed_process_proposal,
)
from .process_mutation_policy import (
    has_independent_process_approver,
    safe_process_department_label,
    safe_process_user_label,
)


async def assert_no_pending_process_mutation(db: AsyncSession, *, process_id: int) -> None:
    active = (
        await db.execute(
            select(GovernedMutationImpactLock.id)
            .where(
                GovernedMutationImpactLock.resource_type == "process",
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if active is not None:
        approval_id = (
            await db.execute(
                select(ApprovalRequest.id)
                .join(GovernedMutationProposal)
                .join(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.id == active)
            )
        ).scalar_one()
        raise ConflictError(
            f"A governed Process change is already pending (approval {approval_id})",
            code="process_pending_mutation",
        )


async def active_governed_process_mutation_ids(
    db: AsyncSession,
    *,
    process_ids: set[int],
) -> set[int]:
    """Batch-project active Process impact locks for authoritative UI gating."""
    if not process_ids:
        return set()
    rows = await db.execute(
        select(GovernedMutationImpactLock.resource_id)
        .where(
            GovernedMutationImpactLock.resource_type == "process",
            GovernedMutationImpactLock.resource_id.in_(process_ids),
            GovernedMutationImpactLock.released_at.is_(None),
        )
        .distinct()
    )
    return set(rows.scalars().all())


def _change_snapshots(
    process: Process,
    updates: dict[str, object],
    *,
    proposed_owner: User | None,
    proposed_department: Department | None,
) -> tuple[dict, dict, dict, dict, dict]:
    raw_before = {field: jsonable_encoder(getattr(process, field)) for field in sorted(updates)}
    raw_after = {field: jsonable_encoder(value) for field, value in sorted(updates.items())}
    before = dict(raw_before)
    after = dict(raw_after)
    if "process_owner_user_id" in updates:
        before["process_owner_user_id"] = safe_process_user_label(process.process_owner)
        after["process_owner_user_id"] = safe_process_user_label(proposed_owner)
    if "owning_department_id" in updates:
        before["owning_department_id"] = safe_process_department_label(process.owning_department)
        after["owning_department_id"] = safe_process_department_label(proposed_department)
    changes = {
        field: {"old": before[field], "new": after[field]}
        for field in sorted(updates)
        if raw_before[field] != raw_after[field]
    }
    return before, after, changes, raw_before, raw_after


async def submit_process_mutation_if_required(
    *,
    db: AsyncSession,
    process: Process,
    updates: dict[str, object],
    request_reason: str | None,
    current_user: User,
    proposed_owner: User | None = None,
    proposed_department: Department | None = None,
) -> JSONResponse | None:
    """Queue a protected mutation, or return ``None`` for direct application."""
    current_block, proposed_block = await load_governed_process_derived_blocks(
        db,
        process,
        updates=updates,
    )
    if current_block.cif != "yes" and proposed_block.cif != "yes":
        return None

    before, after, changes, raw_before, raw_after = _change_snapshots(
        process,
        updates,
        proposed_owner=proposed_owner,
        proposed_department=proposed_department,
    )
    if not changes:
        return None

    scenario = await load_fixed_process_scenario_for_update(db)
    roles = validated_fixed_process_roles(scenario)
    if not scenario.requires_approval:
        return None

    reason = (request_reason or "").strip()
    if not reason:
        raise ValidationError(
            "A request reason is mandatory for a protected Process change",
            code="governed_mutation_reason_required",
            status_code=422,
        )
    if not await has_independent_process_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
        process=process,
    ):
        raise ConflictError(
            "No independent Risk Manager or CRO is available to approve this change",
            code="governed_mutation_approver_missing",
        )

    process_display_name = canonical_process_display_name(
        process.f_code,
        process.l1_process,
    )
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=process.id,
        resource_name=process_display_name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=changes,
        scenario_key=SCENARIO_KEY,
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    try:
        await db.flush()
        proposal = new_governed_process_proposal(
            approval_request_id=approval.id,
            requested_by_id=current_user.id,
            process_id=process.id,
            process_name=process_display_name,
            approver_roles=roles,
            base_governance_version=process.governance_version,
            before_snapshot=before,
            after_snapshot=after,
            raw_before=raw_before,
            raw_after=raw_after,
            derived_impact_snapshot={
                "before": {
                    "cif": current_block.cif,
                    "criticality_class": current_block.criticality_class,
                },
                "after": {
                    "cif": proposed_block.cif,
                    "criticality_class": proposed_block.criticality_class,
                },
            },
        )
        db.add(proposal)
        await db.flush()
        db.add(
            GovernedMutationImpactLock(
                proposal_id=proposal.id,
                resource_type="process",
                resource_id=process.id,
                base_governance_version=process.governance_version,
            )
        )
        await db.flush()
        await audit_governed.proposal_submitted(
            db,
            actor=current_user,
            approval=approval,
            proposal=proposal,
            department_id=process.owning_department_id,
            changes=changes,
        )
        await OutboxService.enqueue(
            db,
            event_type="approval.request_created",
            aggregate_type="approval_request",
            aggregate_id=approval.id,
            idempotency_key=f"approval.request_created:{approval.id}:pending",
            payload={"approval_id": approval.id},
        )
        await commit_service_boundary(db, boundary="governed_mutation.process_submit")
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(
            "A governed Process change is already pending",
            code="process_pending_mutation",
        ) from exc

    return build_approval_queued_response(
        message="Protected Process change submitted for independent approval",
        approval_id=approval.id,
        action_type="edit",
        pending_fields=list(changes),
        pending_changes=changes,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )
