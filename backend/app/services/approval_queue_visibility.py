"""Approval queue visibility helpers."""

from __future__ import annotations

from sqlalchemy import String, and_, cast, false, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from app.core.permissions import control_visibility_clause, kri_visibility_clause, risk_visibility_clause
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    KeyRiskIndicator,
    Process,
    Risk,
    User,
)
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
from app.services.approval_scenario_policy import (
    approval_privilege_tier,
    approval_resource_type_filter_clause,
    governed_process_approval_exists_clause,
    governed_process_requester_clause,
    process_approval_resolver_clause,
    process_approval_visibility_clause,
)

PENDING_APPROVAL_STATUSES = (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)


def _json_role_contains(role_name: str):
    return cast(ApprovalRequest.scenario_approver_roles, String).contains(f'"{role_name}"')


def _scenario_role_match_clause(current_user: User):
    clauses = []
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    if role_name:
        clauses.append(_json_role_contains(str(role_name)))
    clauses.append(and_(_json_role_contains("risk_owner"), ApprovalRequest.primary_approver_id == current_user.id))
    return or_(*clauses) if clauses else false()


async def _approval_resource_visibility_clause(db: AsyncSession, current_user: User):
    risk_query = select(Risk.id)
    risk_clause = await risk_visibility_clause(db, current_user)
    if risk_clause is not None:
        risk_query = risk_query.where(risk_clause)

    control_query = select(Control.id)
    control_clause = control_visibility_clause(current_user)
    if control_clause is not None:
        control_query = control_query.where(control_clause)

    kri_query = select(KeyRiskIndicator.id).join(Risk)
    kri_clause = await kri_visibility_clause(db, current_user)
    if kri_clause is not None:
        kri_query = kri_query.where(kri_clause)

    process_query = select(Process.id)
    process_clause = process_approval_visibility_clause(current_user)
    if process_clause is not None:
        process_query = process_query.where(process_clause)

    return or_(
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.RISK,
            ApprovalRequest.resource_id.in_(risk_query),
        ),
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            ApprovalRequest.resource_id.in_(control_query),
        ),
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id.in_(kri_query),
        ),
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.PROCESS,
            ApprovalRequest.resource_id.in_(process_query),
        ),
    )


async def visible_pending_approvals_for_user(
    db: AsyncSession,
    *,
    current_user: User,
    resource_type: ApprovalResourceType | None = None,
    include_requester: bool = True,
) -> list[ApprovalRequest]:
    """Load non-privileged pending approvals visible to requester, primary, or scenario approver."""
    query = await build_visible_pending_approvals_query(
        db,
        current_user=current_user,
        resource_type=resource_type,
        include_requester=include_requester,
    )
    result = await db.execute(
        query.options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
    )
    return list(result.scalars().all())


async def build_visible_pending_approvals_query(
    db: AsyncSession,
    *,
    current_user: User,
    resource_type: ApprovalResourceType | None = None,
    include_requester: bool = True,
) -> Select[tuple[ApprovalRequest]]:
    """Build the canonical pending-approval visibility query before pagination."""
    valid_extended_ids = await valid_extended_process_approval_ids(
        db,
        approval_statuses=PENDING_APPROVAL_STATUSES,
    )
    valid_asset_ids = await valid_asset_approval_ids(
        db,
        approval_statuses=PENDING_APPROVAL_STATUSES,
    )
    asset_governed = ApprovalRequest.id.in_(tuple(valid_asset_ids)) if valid_asset_ids else false()
    live_asset_resolver_ids = await live_asset_resolver_approval_ids(
        db,
        current_user=current_user,
        approval_statuses=PENDING_APPROVAL_STATUSES,
    )
    asset_resolver = ApprovalRequest.id.in_(tuple(live_asset_resolver_ids)) if live_asset_resolver_ids else false()
    governed_process = governed_process_approval_exists_clause(valid_extended_ids)
    any_proposal = any_governed_mutation_proposal_exists_clause()
    legacy_candidate_clauses = [
        and_(
            ApprovalRequest.primary_approver_id == current_user.id,
            ApprovalRequest.status == ApprovalStatus.PENDING,
            ApprovalRequest.requested_by_id != current_user.id,
        ),
        and_(
            ApprovalRequest.status == ApprovalStatus.PENDING,
            ApprovalRequest.requested_by_id != current_user.id,
            ApprovalRequest.scenario_approver_roles.is_not(None),
            _scenario_role_match_clause(current_user),
            await _approval_resource_visibility_clause(db, current_user),
        ),
    ]
    legacy_visibility = (
        true()
        if include_requester and approval_privilege_tier(current_user).is_privileged
        else or_(*legacy_candidate_clauses)
    )
    candidate_clauses = [
        and_(
            governed_process,
            ApprovalRequest.status.in_(PENDING_APPROVAL_STATUSES),
            process_approval_resolver_clause(current_user, valid_extended_ids),
        ),
        and_(
            ApprovalRequest.status.in_(PENDING_APPROVAL_STATUSES),
            asset_resolver,
        ),
        and_(
            ~any_proposal,
            ApprovalRequest.status.in_(PENDING_APPROVAL_STATUSES),
            legacy_visibility,
        ),
    ]
    if include_requester:
        candidate_clauses.append(
            and_(
                ApprovalRequest.status.in_(PENDING_APPROVAL_STATUSES),
                or_(
                    and_(
                        ~any_proposal,
                        ApprovalRequest.requested_by_id == current_user.id,
                    ),
                    governed_process_requester_clause(current_user.id, valid_extended_ids),
                    and_(asset_governed, ApprovalRequest.requested_by_id == current_user.id),
                ),
            )
        )

    query = select(ApprovalRequest).where(or_(*candidate_clauses))
    if resource_type is not None:
        query = query.where(
            or_(
                approval_resource_type_filter_clause(resource_type, valid_extended_ids),
                and_(resource_type == ApprovalResourceType.ASSET, asset_governed),
            )
        )
    return query.order_by(ApprovalRequest.created_at.desc(), ApprovalRequest.id.desc())


async def count_visible_pending_approvals_for_user(
    db: AsyncSession,
    *,
    current_user: User,
) -> int:
    """Count non-privileged pending approvals visible to requester, primary, or scenario approver."""
    query = await build_visible_pending_approvals_query(db, current_user=current_user)
    return (await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))).scalar() or 0
