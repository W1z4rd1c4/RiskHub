"""Event handlers for typed outbox payloads."""

from __future__ import annotations

from typing import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.approval_display import approval_resource_label
from app.core.permissions import can_read_issue_id, can_read_risk_id
from app.i18n import t
from app.models import (
    ApprovalRequest,
    Issue,
    NotificationType,
    Permission,
    RiskQuestionnaire,
    RiskQuestionnaireClarification,
    Role,
    RolePermission,
    User,
)
from app.models.role import RoleType
from app.models.user import AccessScope
from app.services.notification_service import NotificationService
from app.services.outbox.payloads import (
    ApprovalRequestCancelledPayload,
    ApprovalRequestCreatedPayload,
    ApprovalRequestResolvedPayload,
    IssueAssignedPayload,
    IssueExceptionApprovedPayload,
    IssueExceptionRequestedPayload,
    OutboxPayloadModel,
    QuestionnaireClarificationRequestedPayload,
    QuestionnaireSentPayload,
    QuestionnaireSubmittedPayload,
)

OutboxHandler = Callable[[AsyncSession, OutboxPayloadModel], Awaitable[None]]


async def _load_approval(db: AsyncSession, approval_id: int) -> ApprovalRequest | None:
    result = await db.execute(
        select(ApprovalRequest)
        .options(
            selectinload(ApprovalRequest.requested_by),
            selectinload(ApprovalRequest.resolved_by),
            selectinload(ApprovalRequest.primary_approver),
        )
        .where(ApprovalRequest.id == approval_id)
    )
    return result.scalar_one_or_none()


async def _load_issue(db: AsyncSession, issue_id: int) -> Issue | None:
    result = await db.execute(
        select(Issue)
        .options(selectinload(Issue.owner), selectinload(Issue.created_by))
        .where(Issue.id == issue_id)
    )
    return result.scalar_one_or_none()


async def _load_questionnaire(db: AsyncSession, questionnaire_id: int) -> RiskQuestionnaire | None:
    result = await db.execute(
        select(RiskQuestionnaire)
        .options(
            selectinload(RiskQuestionnaire.risk),
            selectinload(RiskQuestionnaire.assigned_to_user),
            selectinload(RiskQuestionnaire.sent_by_user),
            selectinload(RiskQuestionnaire.submitted_by_user),
        )
        .where(RiskQuestionnaire.id == questionnaire_id)
    )
    return result.scalar_one_or_none()


async def _load_clarification(db: AsyncSession, clarification_id: int) -> RiskQuestionnaireClarification | None:
    result = await db.execute(
        select(RiskQuestionnaireClarification)
        .options(
            selectinload(RiskQuestionnaireClarification.questionnaire).selectinload(RiskQuestionnaire.risk),
            selectinload(RiskQuestionnaireClarification.requested_by_user),
        )
        .where(RiskQuestionnaireClarification.id == clarification_id)
    )
    return result.scalar_one_or_none()


async def _get_active_user_with_permissions(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(User.id == user_id, User.is_active.is_(True))
    )
    return result.scalar_one_or_none()


async def handle_approval_request_created(db: AsyncSession, payload: ApprovalRequestCreatedPayload) -> None:
    approval = await _load_approval(db, payload.approval_id)
    if approval is None:
        return

    action_label = "delete" if approval.action_type.value == "delete" else "edit"
    if approval.primary_approver_id and approval.primary_approver_id != approval.requested_by_id:
        resource_label = approval_resource_label(approval)
        await NotificationService.create_notification_once(
            db=db,
            user_id=approval.primary_approver_id,
            notification_type=NotificationType.APPROVAL_PENDING,
            title=f"{approval.resource_type.value.upper()} {action_label.capitalize()} Request",
            message=f"{resource_label} requires your approval.",
            resource_type="approval",
            resource_id=approval.id,
        )

    await NotificationService.notify_approvers(db, approval)


async def handle_approval_request_resolved(db: AsyncSession, payload: ApprovalRequestResolvedPayload) -> None:
    approval = await _load_approval(db, payload.approval_id)
    if approval is None:
        return
    await NotificationService.notify_requester_resolved(db, approval, approved=payload.approved)


async def handle_approval_request_cancelled(db: AsyncSession, payload: ApprovalRequestCancelledPayload) -> None:
    approval = await _load_approval(db, payload.approval_id)
    if approval is None:
        return
    cancelled_by = await db.get(User, payload.cancelled_by_user_id)
    if cancelled_by is None:
        return
    await NotificationService.notify_approvers_cancelled(
        db=db,
        approval=approval,
        cancelled_by_user=cancelled_by,
    )


async def handle_issue_assigned(db: AsyncSession, payload: IssueAssignedPayload) -> None:
    issue = await _load_issue(db, payload.issue_id)
    if issue is None or payload.owner_user_id == payload.actor_user_id:
        return

    recipient = await _get_active_user_with_permissions(db, payload.owner_user_id)
    if recipient is None or not await can_read_issue_id(db, recipient, issue.id):
        return

    await NotificationService.create_notification(
        db=db,
        user_id=payload.owner_user_id,
        notification_type=NotificationType.ISSUE_ASSIGNED,
        title=f"Issue assigned: {issue.title}",
        message=f"You have been assigned issue '{issue.title}'.",
        resource_type="issue",
        resource_id=issue.id,
    )


async def handle_issue_exception_requested(db: AsyncSession, payload: IssueExceptionRequestedPayload) -> None:
    issue = await _load_issue(db, payload.issue_id)
    actor = await db.get(User, payload.actor_user_id)
    if issue is None or actor is None:
        return

    permission_load = (
        select(User.id)
        .join(Role, User.role_id == Role.id)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .join(Permission, RolePermission.permission_id == Permission.id)
        .where(
            User.is_active.is_(True),
            User.access_scope == AccessScope.GLOBAL,
            Permission.resource.in_(("issues", "*")),
            Permission.action.in_(("approve", "*")),
        )
        .distinct()
    )
    recipient_ids = set((await db.execute(permission_load)).scalars().all())
    if issue.owner_user_id is not None:
        recipient_ids.add(issue.owner_user_id)

    for recipient_id in recipient_ids:
        if recipient_id == actor.id:
            continue
        recipient = await _get_active_user_with_permissions(db, recipient_id)
        if recipient is None or not await can_read_issue_id(db, recipient, issue.id):
            continue
        await NotificationService.create_notification(
            db=db,
            user_id=recipient.id,
            notification_type=NotificationType.ISSUE_EXCEPTION_REQUESTED,
            title=f"Exception requested: {issue.title}",
            message=f"{actor.name} requested an exception for issue '{issue.title}'.",
            resource_type="issue",
            resource_id=issue.id,
        )


async def handle_issue_exception_approved(db: AsyncSession, payload: IssueExceptionApprovedPayload) -> None:
    issue = await _load_issue(db, payload.issue_id)
    actor = await db.get(User, payload.actor_user_id)
    if issue is None or actor is None:
        return

    recipient_ids = {
        user_id
        for user_id in (payload.requested_by_id, payload.owner_user_id)
        if user_id is not None and user_id != actor.id
    }
    for user_id in recipient_ids:
        recipient = await _get_active_user_with_permissions(db, user_id)
        if recipient is None or not await can_read_issue_id(db, recipient, issue.id):
            continue
        await NotificationService.create_notification(
            db=db,
            user_id=user_id,
            notification_type=NotificationType.ISSUE_EXCEPTION_APPROVED,
            title=f"Exception approved: {issue.title}",
            message=f"An exception for issue '{issue.title}' was approved by {actor.name}.",
            resource_type="issue",
            resource_id=issue.id,
        )


async def _questionnaire_rm_cro_recipients(db: AsyncSession, *, actor_user_id: int) -> list[User]:
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    recipients_stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(
            User.is_active.is_(True),
            User.id != actor_user_id,
            Role.name.in_([RoleType.RISK_MANAGER, RoleType.CRO]),
        )
        .options(permission_load)
    )
    return (await db.execute(recipients_stmt)).scalars().all()


async def handle_questionnaire_sent(db: AsyncSession, payload: QuestionnaireSentPayload) -> None:
    questionnaire = await _load_questionnaire(db, payload.questionnaire_id)
    if questionnaire is None or questionnaire.assigned_to_user is None:
        return

    assignee = questionnaire.assigned_to_user
    locale = assignee.preferred_language or "en"
    await NotificationService.create_notification(
        db=db,
        user_id=assignee.id,
        notification_type=NotificationType.QUESTIONNAIRE_SENT,
        title=t("notifications.questionnaire_sent_title", locale=locale),
        message=t(
            "notifications.questionnaire_sent_message",
            locale=locale,
            risk_name=questionnaire.risk.name if questionnaire.risk else "Risk",
            due_date=questionnaire.due_at.date().isoformat(),
        ),
        resource_type="risk",
        resource_id=questionnaire.risk_id,
    )


async def handle_questionnaire_submitted(db: AsyncSession, payload: QuestionnaireSubmittedPayload) -> None:
    questionnaire = await _load_questionnaire(db, payload.questionnaire_id)
    actor = await db.get(User, payload.actor_user_id)
    if questionnaire is None or actor is None:
        return

    recipients = await _questionnaire_rm_cro_recipients(db, actor_user_id=actor.id)
    for recipient in recipients:
        if not await can_read_risk_id(db, recipient, questionnaire.risk_id):
            continue
        locale = recipient.preferred_language or "en"
        await NotificationService.create_notification(
            db=db,
            user_id=recipient.id,
            notification_type=NotificationType.QUESTIONNAIRE_SUBMITTED,
            title=t("notifications.questionnaire_submitted_title", locale=locale),
            message=t(
                "notifications.questionnaire_submitted_message",
                locale=locale,
                actor_name=actor.name,
                risk_name=questionnaire.risk.name if questionnaire.risk else "Risk",
            ),
            resource_type="risk",
            resource_id=questionnaire.risk_id,
        )


async def handle_questionnaire_clarification_requested(
    db: AsyncSession,
    payload: QuestionnaireClarificationRequestedPayload,
) -> None:
    clarification = await _load_clarification(db, payload.clarification_id)
    if clarification is None or clarification.questionnaire.assigned_to_user is None:
        return

    assignee = clarification.questionnaire.assigned_to_user
    locale = assignee.preferred_language or "en"
    await NotificationService.create_notification(
        db=db,
        user_id=assignee.id,
        notification_type=NotificationType.QUESTIONNAIRE_CLARIFICATION_REQUESTED,
        title=t("notifications.questionnaire_clarification_requested_title", locale=locale),
        message=t(
            "notifications.questionnaire_clarification_requested_message",
            locale=locale,
            risk_name=clarification.questionnaire.risk.name if clarification.questionnaire.risk else "Risk",
        ),
        resource_type="risk",
        resource_id=clarification.questionnaire.risk_id,
    )


OUTBOX_EVENT_HANDLERS: dict[str, OutboxHandler] = {
    "approval.request_created": handle_approval_request_created,
    "approval.request_resolved": handle_approval_request_resolved,
    "approval.request_cancelled": handle_approval_request_cancelled,
    "issue.assigned": handle_issue_assigned,
    "issue.exception_requested": handle_issue_exception_requested,
    "issue.exception_approved": handle_issue_exception_approved,
    "questionnaire.sent": handle_questionnaire_sent,
    "questionnaire.submitted": handle_questionnaire_submitted,
    "questionnaire.clarification_requested": handle_questionnaire_clarification_requested,
}
