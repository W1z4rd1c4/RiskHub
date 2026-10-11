"""Ordered envelope loading and terminal response reloads for governed families."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.exceptions import NotFoundError, ValidationError
from app.models import ApprovalRequest, GovernedMutationImpactLock, GovernedMutationProposal


async def load_resolution_envelope(
    db: AsyncSession,
    approval_id: int,
    *,
    resource_type: str | None = None,
) -> tuple[ApprovalRequest, GovernedMutationProposal, list[GovernedMutationImpactLock]]:
    """Lock approval -> immutable proposal -> sorted impacts before family locks.

    Refresh identity-map state after obtaining each lock so a waiting resolver
    observes a prior resolver's committed terminal decision, not its stale copy.
    """
    approval = (
        await db.execute(
            select(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if approval is None:
        raise NotFoundError("Approval request not found")
    proposal = (
        await db.execute(
            select(GovernedMutationProposal)
            .where(GovernedMutationProposal.approval_request_id == approval.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if proposal is None or (resource_type is not None and proposal.primary_resource_type != resource_type):
        label = f"governed {resource_type.title()} mutation" if resource_type else "governed mutation proposal"
        raise ValidationError(f"Approval is not a {label}")
    # Both objects are now locked/refreshed; bind the exact locked envelope
    # without a lazy relationship read or an additional lock-order edge.
    set_committed_value(proposal, "approval_request", approval)
    locks = list(
        (
            await db.execute(
                select(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.proposal_id == proposal.id)
                .order_by(
                    GovernedMutationImpactLock.resource_type,
                    GovernedMutationImpactLock.resource_id,
                    GovernedMutationImpactLock.id,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    return approval, proposal, locks


async def reload_resolution_approval(db: AsyncSession, approval_id: int) -> ApprovalRequest:
    return (
        await db.execute(
            select(ApprovalRequest)
            .options(
                selectinload(ApprovalRequest.requested_by),
                selectinload(ApprovalRequest.resolved_by),
                selectinload(ApprovalRequest.governed_mutation_proposal).selectinload(
                    GovernedMutationProposal.requested_by
                ),
            )
            .where(ApprovalRequest.id == approval_id)
        )
    ).scalar_one()


__all__ = ["load_resolution_envelope", "reload_resolution_approval"]
