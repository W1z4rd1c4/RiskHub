"""Visibility helpers for user-owned notification payloads."""

from typing import Any

from sqlalchemy import String, and_, cast, false, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.permissions import (
    can_resolve_approvals,
    control_visibility_clause,
    get_issue_scope_clause,
    has_permission,
    kri_visibility_clause,
    risk_visibility_clause,
    vendor_visibility_clause,
)
from app.models import ApprovalRequest, Control, Issue, KeyRiskIndicator, Notification, Risk, RiskQuestionnaire, User
from app.models.approval_request import ApprovalResourceType
from app.models.vendor import Vendor
from app.services.approval_scenario_policy import can_view_approval_resource, user_matches_approval_scenario_role
from app.services.risk_questionnaire_service import can_read_questionnaire


async def visible_notification_clause(db: AsyncSession, current_user: User) -> ColumnElement[bool]:
    """Build the bounded SQL predicate for notifications visible to the current actor."""
    risk_clause = await risk_visibility_clause(db, current_user)
    control_clause = control_visibility_clause(current_user)
    kri_clause = await kri_visibility_clause(db, current_user)
    vendor_clause = vendor_visibility_clause(current_user)
    issue_clause = (
        await get_issue_scope_clause(db, current_user) if has_permission(current_user, "issues", "read") else false()
    )
    resource_type = func.lower(Notification.resource_type)

    return and_(
        Notification.user_id == current_user.id,
        or_(
            Notification.resource_type.is_(None),
            Notification.resource_id.is_(None),
            and_(resource_type == "risk", _risk_exists_clause(risk_clause, Notification.resource_id)),
            and_(resource_type == "control", _control_exists_clause(control_clause, Notification.resource_id)),
            and_(resource_type == "kri", _kri_exists_clause(kri_clause, Notification.resource_id)),
            and_(resource_type == "vendor", _vendor_exists_clause(vendor_clause, Notification.resource_id)),
            and_(resource_type == "issue", _issue_exists_clause(issue_clause, Notification.resource_id)),
            and_(resource_type == "questionnaire", _questionnaire_exists_clause(risk_clause, Notification.resource_id)),
            and_(
                resource_type == "approval",
                _approval_exists_clause(
                    current_user,
                    risk_clause=risk_clause,
                    control_clause=control_clause,
                    kri_clause=kri_clause,
                    resource_id=Notification.resource_id,
                ),
            ),
        ),
    )


async def can_view_notification_resource(
    db: AsyncSession,
    current_user: User,
    notification: Notification,
) -> bool:
    """Return whether the linked notification payload is still visible to the actor."""
    clause = await visible_notification_clause(db, current_user)
    result = await db.execute(select(Notification.id).where(Notification.id == notification.id, clause))
    return result.scalar_one_or_none() is not None


async def _can_view_approval_notification(db: AsyncSession, current_user: User, approval_id: int) -> bool:
    approval = await db.get(ApprovalRequest, approval_id)
    if approval is None:
        return False
    if approval.requested_by_id == current_user.id or approval.primary_approver_id == current_user.id:
        return True
    if can_resolve_approvals(current_user):
        return True
    return (
        user_matches_approval_scenario_role(approval, current_user) is True
        and await can_view_approval_resource(db, current_user, approval)
    )


async def _can_view_questionnaire_notification(db: AsyncSession, current_user: User, questionnaire_id: int) -> bool:
    questionnaire = await db.get(RiskQuestionnaire, questionnaire_id)
    if questionnaire is None:
        return False
    return await can_read_questionnaire(db, current_user, questionnaire)


async def paginate_visible_notifications(
    db: AsyncSession,
    current_user: User,
    *,
    skip: int,
    limit: int,
    unread_only: bool = False,
) -> tuple[list[Notification], int, int]:
    visibility_clause = await visible_notification_clause(db, current_user)
    total_query = select(func.count()).select_from(Notification).where(visibility_clause)
    if unread_only:
        total_query = total_query.where(Notification.is_read.is_(False))
    total = (await db.execute(total_query)).scalar() or 0

    unread_count = await count_visible_unread_notifications(db, current_user)

    page_query = (
        select(Notification)
        .where(visibility_clause)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(skip)
        .limit(limit)
    )
    if unread_only:
        page_query = page_query.where(Notification.is_read.is_(False))

    notifications = list((await db.execute(page_query)).scalars().all())
    return notifications, total, unread_count


async def count_visible_unread_notifications(db: AsyncSession, current_user: User) -> int:
    visibility_clause = await visible_notification_clause(db, current_user)
    result = await db.execute(
        select(func.count()).select_from(Notification).where(visibility_clause, Notification.is_read.is_(False))
    )
    return result.scalar() or 0


def _risk_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(Risk.id).where(Risk.id == resource_id)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _control_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(Control.id).where(Control.id == resource_id)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _kri_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(KeyRiskIndicator.id).join(Risk, Risk.id == KeyRiskIndicator.risk_id).where(
        KeyRiskIndicator.id == resource_id
    )
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _vendor_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(Vendor.id).where(Vendor.id == resource_id)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _issue_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(Issue.id).where(Issue.id == resource_id)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _questionnaire_exists_clause(
    risk_visibility_clause_value: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(RiskQuestionnaire.id).join(Risk, Risk.id == RiskQuestionnaire.risk_id).where(
        RiskQuestionnaire.id == resource_id
    )
    if risk_visibility_clause_value is not None:
        query = query.where(risk_visibility_clause_value)
    return query.exists()


def _approval_exists_clause(
    current_user: User,
    *,
    risk_clause: ColumnElement[bool] | None,
    control_clause: ColumnElement[bool] | None,
    kri_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    direct_clauses: list[ColumnElement[bool]] = [
        ApprovalRequest.requested_by_id == current_user.id,
        ApprovalRequest.primary_approver_id == current_user.id,
    ]
    if can_resolve_approvals(current_user):
        direct_clauses.append(true())

    role_name = getattr(getattr(current_user, "role", None), "name", None)
    scenario_clause: ColumnElement[bool] = false()
    if role_name:
        scenario_clause = and_(
            ApprovalRequest.scenario_approver_roles.is_not(None),
            cast(ApprovalRequest.scenario_approver_roles, String).contains(f'"{role_name}"'),
            _approval_resource_visibility_clause(
                risk_clause=risk_clause,
                control_clause=control_clause,
                kri_clause=kri_clause,
            ),
        )

    return (
        select(ApprovalRequest.id)
        .where(
            ApprovalRequest.id == resource_id,
            or_(*direct_clauses, scenario_clause),
        )
        .exists()
    )


def _approval_resource_visibility_clause(
    *,
    risk_clause: ColumnElement[bool] | None,
    control_clause: ColumnElement[bool] | None,
    kri_clause: ColumnElement[bool] | None,
) -> ColumnElement[bool]:
    return or_(
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.RISK,
            _risk_exists_clause(risk_clause, ApprovalRequest.resource_id),
        ),
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            _control_exists_clause(control_clause, ApprovalRequest.resource_id),
        ),
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            _kri_exists_clause(kri_clause, ApprovalRequest.resource_id),
        ),
    )
