"""Strict queue selection for governed Vendor proposals."""

from __future__ import annotations

from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ApprovalRequest, ApprovalStatus, GovernedMutationProposal, User
from app.services._governed_mutations.fixed_vendor_policy import (
    is_live_eligible_vendor_resolver,
    load_fixed_vendor_scenario,
)
from app.services._governed_mutations.vendor_identity import (
    VENDOR_ARCHIVE_KIND,
    VENDOR_CHILD_KINDS,
    VENDOR_CREATE_KIND,
    VENDOR_EDIT_KIND,
    VENDOR_RELATIONSHIP_KINDS,
    strict_vendor_mutation_kind,
)

_VENDOR_KINDS = (
    VENDOR_CREATE_KIND,
    VENDOR_EDIT_KIND,
    VENDOR_ARCHIVE_KIND,
    *sorted(VENDOR_CHILD_KINDS),
    *sorted(VENDOR_RELATIONSHIP_KINDS),
)


async def valid_vendor_approvals(
    db: AsyncSession,
    *,
    approval_statuses: Collection[ApprovalStatus] | None = None,
    approval_ids: Collection[int] | None = None,
) -> dict[int, GovernedMutationProposal]:
    """Return only immutable Vendor identities that pass the strict classifier."""
    statement = (
        select(ApprovalRequest)
        .join(
            GovernedMutationProposal,
            GovernedMutationProposal.approval_request_id == ApprovalRequest.id,
        )
        .where(GovernedMutationProposal.mutation_kind.in_(_VENDOR_KINDS))
        .options(selectinload(ApprovalRequest.governed_mutation_proposal))
    )
    if approval_statuses is not None:
        statement = statement.where(ApprovalRequest.status.in_(tuple(approval_statuses)))
    if approval_ids is not None:
        if not approval_ids:
            return {}
        statement = statement.where(ApprovalRequest.id.in_(tuple(approval_ids)))
    approvals = (await db.execute(statement)).scalars().all()
    return {
        approval.id: proposal
        for approval in approvals
        if (proposal := approval.governed_mutation_proposal) is not None
        and strict_vendor_mutation_kind(proposal) is not None
    }


async def live_vendor_resolver_approval_ids(
    db: AsyncSession,
    *,
    current_user: User,
    proposals: dict[int, GovernedMutationProposal],
) -> frozenset[int]:
    scenario = await load_fixed_vendor_scenario(db)
    return frozenset(
        approval_id
        for approval_id, proposal in proposals.items()
        if is_live_eligible_vendor_resolver(
            current_user,
            proposal,
            scenario,
        )
    )


__all__ = [
    "live_vendor_resolver_approval_ids",
    "valid_vendor_approvals",
]
