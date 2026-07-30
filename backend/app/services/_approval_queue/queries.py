from __future__ import annotations

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationProposal,
    User,
)
from app.schemas.approval_request import ApprovalRequestListResponse, ApprovalResourceTypeEnum, ApprovalStatusEnum
from app.services._governed_mutations.asset_identity import (
    live_asset_resolver_approval_ids,
    valid_asset_approval_ids,
)
from app.services._governed_mutations.process_identity import (
    any_governed_mutation_proposal_exists_clause,
)
from app.services._governed_mutations.process_mutations import (
    valid_extended_process_approval_ids,
)
from app.services._ict_register_lifecycle.policy import can_use_process_assignment_lookup
from app.services.approval_queue_visibility import build_visible_pending_approvals_query
from app.services.approval_scenario_policy import (
    approval_privilege_tier,
    approval_resource_type_filter_clause,
    governed_process_approval_exists_clause,
    governed_process_requester_clause,
    process_approval_resolver_clause,
)

from .logging import queue_logger
from .projection import (
    approval_queue_page,
    governed_process_actor_safe_labels,
    governed_process_resolver_ids,
    governed_process_snapshot_access_ids,
)
from .threat import live_threat_resolver_approval_ids, valid_threat_approvals
from .vendor import live_vendor_resolver_approval_ids, valid_vendor_approvals


def _projection_load_options():
    return (
        selectinload(ApprovalRequest.requested_by),
        selectinload(ApprovalRequest.resolved_by),
        selectinload(ApprovalRequest.governed_mutation_proposal).selectinload(GovernedMutationProposal.requested_by),
    )


async def _project_approval_queue_page(
    *,
    db: AsyncSession,
    approvals: list[ApprovalRequest],
    total: int,
    skip: int,
    limit: int,
    current_user: User,
) -> ApprovalRequestListResponse:
    can_view_governed_references = await can_use_process_assignment_lookup(
        db,
        current_user=current_user,
    )
    governed_snapshot_access_ids = await governed_process_snapshot_access_ids(
        db,
        approvals=approvals,
        current_user=current_user,
    )
    governed_resolver_ids = await governed_process_resolver_ids(
        db,
        approvals=approvals,
        current_user=current_user,
    )
    actor_safe_extended_labels = await governed_process_actor_safe_labels(
        db,
        approvals=approvals,
        current_user=current_user,
    )
    return approval_queue_page(
        approvals=approvals,
        total=total,
        skip=skip,
        limit=limit,
        current_user=current_user,
        governed_snapshot_access_ids=governed_snapshot_access_ids,
        governed_resolver_ids=governed_resolver_ids,
        can_view_governed_references=can_view_governed_references,
        actor_safe_extended_labels=actor_safe_extended_labels,
    ).to_response()


async def list_approval_queue_page(
    *,
    db: AsyncSession,
    current_user: User,
    skip: int,
    limit: int,
    status_filter: ApprovalStatusEnum | None,
    resource_type: ApprovalResourceTypeEnum | None,
    my_requests: bool,
) -> ApprovalRequestListResponse:
    tier = approval_privilege_tier(current_user)
    if status_filter == ApprovalStatusEnum.pending:
        candidate_statuses = (
            ApprovalStatus.PENDING,
            ApprovalStatus.PENDING_PRIVILEGED,
        )
    elif status_filter is not None:
        candidate_statuses = (ApprovalStatus(status_filter.value.upper()),)
    else:
        candidate_statuses = None
    valid_extended_ids = (
        frozenset()
        if status_filter == ApprovalStatusEnum.pending and not my_requests
        else await valid_extended_process_approval_ids(
            db,
            approval_statuses=candidate_statuses,
        )
    )
    valid_asset_ids = await valid_asset_approval_ids(
        db,
        approval_statuses=candidate_statuses,
    )
    valid_vendor_proposals = await valid_vendor_approvals(
        db,
        approval_statuses=candidate_statuses,
    )
    valid_vendor_ids = frozenset(valid_vendor_proposals)
    valid_threat_proposals = await valid_threat_approvals(
        db,
        approval_statuses=candidate_statuses,
    )
    valid_threat_ids = frozenset(valid_threat_proposals)
    asset_governed = ApprovalRequest.id.in_(tuple(valid_asset_ids)) if valid_asset_ids else false()
    asset_requester = and_(
        asset_governed,
        ApprovalRequest.requested_by_id == current_user.id,
    )
    live_asset_resolver_ids = await live_asset_resolver_approval_ids(
        db,
        current_user=current_user,
        approval_statuses=candidate_statuses,
    )
    asset_resolver = ApprovalRequest.id.in_(tuple(live_asset_resolver_ids)) if live_asset_resolver_ids else false()
    vendor_governed = (
        ApprovalRequest.id.in_(tuple(valid_vendor_ids))
        if valid_vendor_ids
        else false()
    )
    vendor_requester = and_(
        vendor_governed,
        ApprovalRequest.requested_by_id == current_user.id,
    )
    live_vendor_resolver_ids = await live_vendor_resolver_approval_ids(
        db,
        current_user=current_user,
        proposals=valid_vendor_proposals,
    )
    vendor_resolver = (
        ApprovalRequest.id.in_(tuple(live_vendor_resolver_ids))
        if live_vendor_resolver_ids
        else false()
    )
    threat_governed = (
        ApprovalRequest.id.in_(tuple(valid_threat_ids))
        if valid_threat_ids
        else false()
    )
    threat_requester = and_(
        threat_governed,
        ApprovalRequest.requested_by_id == current_user.id,
    )
    live_threat_resolver_ids = await live_threat_resolver_approval_ids(
        db,
        current_user=current_user,
        proposals=valid_threat_proposals,
    )
    threat_resolver = (
        ApprovalRequest.id.in_(tuple(live_threat_resolver_ids))
        if live_threat_resolver_ids
        else false()
    )
    queue_logger.info(
        (
            f"List approvals: user={current_user.id} can_resolve={tier.is_privileged} "
            f"filter={status_filter} my={my_requests}"
        )
    )
    base_query = select(ApprovalRequest)
    is_privileged = tier.is_privileged
    if my_requests:
        governed_process = governed_process_approval_exists_clause(valid_extended_ids)
        any_proposal = any_governed_mutation_proposal_exists_clause()
        base_query = base_query.where(
            or_(
                and_(
                    ~any_proposal,
                    ApprovalRequest.requested_by_id == current_user.id,
                ),
                governed_process_requester_clause(current_user.id, valid_extended_ids),
                asset_requester,
                vendor_requester,
                threat_requester,
            )
        )
    elif status_filter != ApprovalStatusEnum.pending:
        governed_process = governed_process_approval_exists_clause(valid_extended_ids)
        any_proposal = any_governed_mutation_proposal_exists_clause()
        if is_privileged:
            base_query = base_query.where(
                or_(
                    ~any_proposal,
                    governed_process_requester_clause(current_user.id, valid_extended_ids),
                    process_approval_resolver_clause(current_user, valid_extended_ids),
                    asset_requester,
                    asset_resolver,
                    vendor_requester,
                    vendor_resolver,
                    threat_requester,
                    threat_resolver,
                )
            )
        else:
            base_query = base_query.where(
                or_(
                    and_(
                        ~any_proposal,
                        ApprovalRequest.requested_by_id == current_user.id,
                    ),
                    and_(
                        governed_process,
                        or_(
                            governed_process_requester_clause(current_user.id, valid_extended_ids),
                            process_approval_resolver_clause(current_user, valid_extended_ids),
                        ),
                    ),
                    asset_requester,
                    asset_resolver,
                    vendor_requester,
                    vendor_resolver,
                    threat_requester,
                    threat_resolver,
                )
            )

    if status_filter:
        if status_filter == ApprovalStatusEnum.pending:
            if my_requests:
                base_query = base_query.where(
                    ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
                )
            else:
                pending_query = await build_visible_pending_approvals_query(
                    db,
                    current_user=current_user,
                    resource_type=ApprovalResourceType(resource_type.value) if resource_type else None,
                )
                count_query = select(func.count()).select_from(pending_query.order_by(None).subquery())
                total = (await db.execute(count_query)).scalar() or 0
                result = await db.execute(pending_query.options(*_projection_load_options()).offset(skip).limit(limit))
                approvals = list(result.scalars().all())
                return await _project_approval_queue_page(
                    db=db,
                    approvals=approvals,
                    total=total,
                    skip=skip,
                    limit=limit,
                    current_user=current_user,
                )
        else:
            base_query = base_query.where(ApprovalRequest.status == ApprovalStatus(status_filter.value.upper()))
    if resource_type:
        base_query = base_query.where(
            or_(
                approval_resource_type_filter_clause(
                    ApprovalResourceType(resource_type.value),
                    valid_extended_ids,
                ),
                and_(resource_type.value == "asset", asset_governed),
                and_(resource_type.value == "vendor", vendor_governed),
                and_(resource_type.value == "threat", threat_governed),
            )
        )

    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar() or 0
    result = await db.execute(
        base_query.options(*_projection_load_options())
        .offset(skip)
        .limit(limit)
        .order_by(ApprovalRequest.created_at.desc())
    )
    approvals = list(result.scalars().all())
    return await _project_approval_queue_page(
        db=db,
        approvals=approvals,
        total=total,
        skip=skip,
        limit=limit,
        current_user=current_user,
    )


async def list_my_approval_queue_page(
    *,
    db: AsyncSession,
    current_user: User,
    skip: int,
    limit: int,
) -> ApprovalRequestListResponse:
    query = await build_visible_pending_approvals_query(
        db,
        current_user=current_user,
        include_requester=False,
    )
    total = (await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))).scalar() or 0
    result = await db.execute(query.options(*_projection_load_options()).offset(skip).limit(limit))
    approvals = list(result.scalars().all())
    return await _project_approval_queue_page(
        db=db,
        approvals=approvals,
        total=total,
        skip=skip,
        limit=limit,
        current_user=current_user,
    )
