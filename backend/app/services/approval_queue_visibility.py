"""Approval queue visibility helpers."""

from __future__ import annotations

from sqlalchemy import String, and_, cast, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from app.core.permissions import control_visibility_clause, kri_visibility_clause, risk_visibility_clause
from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus, Control, KeyRiskIndicator, Risk, User
from app.services.approval_scenario_policy import can_view_approval_resource, user_matches_approval_scenario_role

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
    )


async def can_view_pending_approval_queue_item(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    current_user: User,
    include_requester: bool = True,
) -> bool:
    """Return whether a non-privileged user should see an approval as pending queue work."""
    if (
        include_requester
        and approval.requested_by_id == current_user.id
        and approval.status in PENDING_APPROVAL_STATUSES
    ):
        return True
    if approval.requested_by_id == current_user.id:
        return False
    if approval.primary_approver_id == current_user.id and approval.status == ApprovalStatus.PENDING:
        return True
    if approval.status != ApprovalStatus.PENDING:
        return False
    if user_matches_approval_scenario_role(approval, current_user) is not True:
        return False
    return await can_view_approval_resource(db, current_user, approval)


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
    """Build SQL-scoped non-privileged pending approval visibility before pagination."""
    candidate_clauses = [
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
    if include_requester:
        candidate_clauses.append(
            and_(
                ApprovalRequest.requested_by_id == current_user.id,
                ApprovalRequest.status.in_(PENDING_APPROVAL_STATUSES),
            )
        )

    query = select(ApprovalRequest).where(or_(*candidate_clauses))
    if resource_type is not None:
        query = query.where(ApprovalRequest.resource_type == resource_type)
    return query.order_by(ApprovalRequest.created_at.desc(), ApprovalRequest.id.desc())


async def count_visible_pending_approvals_for_user(
    db: AsyncSession,
    *,
    current_user: User,
) -> int:
    """Count non-privileged pending approvals visible to requester, primary, or scenario approver."""
    query = await build_visible_pending_approvals_query(db, current_user=current_user)
    return (await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))).scalar() or 0
