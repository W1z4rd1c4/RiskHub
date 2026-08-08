from __future__ import annotations

from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import check_permission
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Threat,
    User,
)
from app.models.role import RoleType
from app.schemas.threat import (
    ThreatListCapabilities,
    ThreatListResponse,
    ThreatPendingChange,
    ThreatRead,
    ThreatStewardRead,
)
from app.services._authorization_capabilities import threat_capabilities


def serialize_threat_detail(
    threat: Threat,
    *,
    current_user: User,
    stewardship_pending: bool = False,
    pending_change: ThreatPendingChange | None = None,
) -> ThreatRead:
    """Project a Threat row with its per-row capabilities (ADR-001 SSOT).

    Threats sit outside the criticality cascade, so — unlike Processes and
    Assets — there is no engine-derived block to attach (compute-on-read has
    nothing to compute here).
    """
    steward = threat.threat_steward
    steward_projection = None
    if steward is not None:
        steward_projection = ThreatStewardRead(
            name=steward.name,
            email=steward.email,
            role_name=steward.role.name,
            department_name=steward.department.name if steward.department is not None else None,
        )
    base = ThreatRead.model_validate(
        {column.name: getattr(threat, column.name) for column in Threat.__table__.columns}
    )
    steward_is_eligible = bool(
        steward is not None
        and steward.is_active
        and steward.role.is_active
        and steward.role.name == RoleType.CISO
    )
    if stewardship_pending:
        stewardship_status = "pending_governance"
    elif steward is None:
        stewardship_status = "legacy_unassigned"
    elif steward_is_eligible:
        stewardship_status = "assigned"
    else:
        stewardship_status = "invalid_assignment"

    capabilities = threat_capabilities(
        current_user,
        threat,
        stewardship_pending=stewardship_pending,
    )
    if pending_change is not None:
        capabilities = capabilities.model_copy(
            update={
                "can_update": False,
                "can_archive": False,
                "has_pending_change": True,
                "business_edit_blocked": True,
                "can_cancel_pending_change": bool(
                    pending_change.capabilities.can_cancel
                ),
            }
        )
    return base.model_copy(
        update={
            "threat_steward": steward_projection,
            # This compatibility flag represents an actual pending Governance
            # workflow. A migrated NULL is an assignable legacy gap and must
            # not direct users to an empty Governance queue.
            "steward_orphaned": stewardship_pending,
            "stewardship_status": stewardship_status,
            "capabilities": capabilities,
            "pending_change": pending_change,
        }
    )


async def load_pending_threat_changes(
    db: AsyncSession,
    *,
    threat_ids: list[int],
    current_user: User,
) -> dict[int, ThreatPendingChange]:
    if not threat_ids:
        return {}
    proposals = (
        (
            await db.execute(
                select(GovernedMutationProposal)
                .options(
                    selectinload(GovernedMutationProposal.approval_request),
                    selectinload(GovernedMutationProposal.requested_by),
                    selectinload(GovernedMutationProposal.impact_locks),
                )
                .join(GovernedMutationImpactLock)
                .join(GovernedMutationProposal.approval_request)
                .where(
                    GovernedMutationImpactLock.resource_type == "threat",
                    GovernedMutationImpactLock.resource_id.in_(threat_ids),
                    GovernedMutationImpactLock.released_at.is_(None),
                    ApprovalRequest.status == ApprovalStatus.PENDING,
                )
            )
        )
        .scalars()
        .unique()
        .all()
    )
    from app.services._governed_mutations.fixed_accountability_policy import (
        is_live_eligible_accountability_resolver,
        load_fixed_accountability_scenario,
    )
    from app.services._governed_mutations.threat_identity import (
        strict_threat_mutation_kind,
    )

    scenario = await load_fixed_accountability_scenario(db)
    result: dict[int, ThreatPendingChange] = {}
    for proposal in proposals:
        if strict_threat_mutation_kind(proposal) is None:
            continue
        approval = proposal.approval_request
        can_view_diff = bool(
            proposal.requested_by_id == current_user.id
            or is_live_eligible_accountability_resolver(
                current_user,
                proposal,
                scenario,
            )
        )
        # strict_threat_mutation_kind() above validated the envelope, including
        # _positive_int(primary_resource_id), so None cannot reach this point.
        result[int(cast(int, proposal.primary_resource_id))] = ThreatPendingChange(
            approval_id=approval.id if can_view_diff else None,
            proposal_id=proposal.proposal_id if can_view_diff else None,
            proposal_version=proposal.proposal_version if can_view_diff else None,
            requested_at=approval.created_at,
            requested_by_name=(
                proposal.requested_by.name
                if can_view_diff and proposal.requested_by is not None
                else None
            ),
            reason=approval.reason if can_view_diff else "",
            mutation_kind=proposal.mutation_kind if can_view_diff else None,
            before=dict(proposal.before_snapshot) if can_view_diff else {},
            after=dict(proposal.after_snapshot) if can_view_diff else {},
            derived_impact=(
                dict(proposal.derived_impact_snapshot) if can_view_diff else {}
            ),
            impacted_resources=(
                [
                    {
                        "resource_type": "threat",
                        "resource_name": "Restricted Threat",
                    }
                ]
                if can_view_diff
                else []
            ),
            capabilities={
                "can_view_diff": can_view_diff,
                "can_cancel": proposal.requested_by_id == current_user.id,
            },
        )
    return result


def build_threat_collection_capabilities(current_user: User) -> ThreatListCapabilities:
    return ThreatListCapabilities(can_create=check_permission(current_user, "threats", "write"))


def serialize_threat_list(
    threats: list[Threat],
    *,
    current_user: User,
    total: int,
    offset: int,
    limit: int,
    pending_stewardship_orphan_ids: set[int] | None = None,
    pending_changes: dict[int, ThreatPendingChange] | None = None,
) -> ThreatListResponse:
    pending_ids = pending_stewardship_orphan_ids or set()
    changes = pending_changes or {}
    return ThreatListResponse(
        items=[
            serialize_threat_detail(
                threat,
                current_user=current_user,
                stewardship_pending=threat.id in pending_ids,
                pending_change=changes.get(threat.id),
            )
            for threat in threats
        ],
        total=total,
        offset=offset,
        limit=limit,
        capabilities=build_threat_collection_capabilities(current_user),
    )
