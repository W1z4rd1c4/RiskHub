"""Transactional outbox enqueueing and dispatch for durable side effects."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.approval_display import approval_resource_label
from app.core.permissions import can_read_issue_id, can_read_risk_id
from app.core.datetime_utils import utc_now
from app.core.logging import get_logger
from app.i18n import t
from app.models import (
    ApprovalRequest,
    Issue,
    NotificationType,
    OutboxEvent,
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

logger = get_logger("outbox")

OUTBOX_DISPATCH_INTERVAL_SECONDS = 5
OUTBOX_BATCH_SIZE = 50
OUTBOX_MAX_ATTEMPTS = 10
OUTBOX_RECLAIM_AFTER = timedelta(minutes=5)


class OutboxService:
    """Persistence operations for durable outbox events."""

    @staticmethod
    async def enqueue(
        db: AsyncSession,
        *,
        event_type: str,
        aggregate_type: str,
        aggregate_id: int | None,
        idempotency_key: str,
        payload: dict,
    ) -> OutboxEvent:
        event = OutboxEvent(
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            idempotency_key=idempotency_key,
            payload=payload,
            status="pending",
            available_at=utc_now(),
            created_at=utc_now(),
        )
        db.add(event)
        await db.flush()
        return event

    @staticmethod
    async def claim_batch(
        db: AsyncSession,
        *,
        batch_size: int = OUTBOX_BATCH_SIZE,
        lock_owner: str = "scheduler",
    ) -> list[str]:
        now = utc_now()
        reclaim_before = now - OUTBOX_RECLAIM_AFTER
        result = await db.execute(
            select(OutboxEvent)
            .where(
                or_(
                    (OutboxEvent.status == "pending") & (OutboxEvent.available_at <= now),
                    (OutboxEvent.status == "processing")
                    & (OutboxEvent.locked_at.is_not(None))
                    & (OutboxEvent.locked_at <= reclaim_before),
                )
            )
            .order_by(OutboxEvent.created_at.asc())
            .limit(batch_size)
        )
        events = result.scalars().all()
        if not events:
            return []

        event_ids: list[str] = []
        for event in events:
            event.status = "processing"
            event.locked_at = now
            event.locked_by = lock_owner
            event.attempt_count += 1
            db.add(event)
            event_ids.append(event.id)

        await db.commit()
        return event_ids

    @staticmethod
    async def mark_succeeded(db: AsyncSession, event_id: str) -> None:
        event = await db.get(OutboxEvent, event_id)
        if event is None:
            return
        event.status = "succeeded"
        event.processed_at = utc_now()
        event.locked_at = None
        event.locked_by = None
        event.last_error = None
        db.add(event)
        await db.commit()

    @staticmethod
    async def mark_retry(db: AsyncSession, event_id: str, *, error_message: str) -> None:
        event = await db.get(OutboxEvent, event_id)
        if event is None:
            return

        if event.attempt_count >= OUTBOX_MAX_ATTEMPTS:
            event.status = "dead_letter"
            event.processed_at = utc_now()
        else:
            delay_seconds = min(300, 2 ** max(0, event.attempt_count - 1))
            event.status = "pending"
            event.available_at = utc_now() + timedelta(seconds=delay_seconds)

        event.locked_at = None
        event.locked_by = None
        event.last_error = error_message
        db.add(event)
        await db.commit()


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
        .options(
            selectinload(Issue.owner),
            selectinload(Issue.created_by),
        )
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
    return (
        await db.execute(
            select(User)
            .options(
                selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
            )
            .where(User.id == user_id, User.is_active.is_(True))
        )
    ).scalar_one_or_none()


async def _handle_approval_request_created(db: AsyncSession, payload: dict) -> None:
    approval = await _load_approval(db, int(payload["approval_id"]))
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


async def _handle_approval_request_resolved(db: AsyncSession, payload: dict) -> None:
    approval = await _load_approval(db, int(payload["approval_id"]))
    if approval is None:
        return
    await NotificationService.notify_requester_resolved(
        db,
        approval,
        approved=bool(payload["approved"]),
    )


async def _handle_approval_request_cancelled(db: AsyncSession, payload: dict) -> None:
    approval = await _load_approval(db, int(payload["approval_id"]))
    if approval is None:
        return
    cancelled_by = await db.get(User, int(payload["cancelled_by_user_id"]))
    if cancelled_by is None:
        return
    await NotificationService.notify_approvers_cancelled(
        db=db,
        approval=approval,
        cancelled_by_user=cancelled_by,
    )


async def _handle_issue_assigned(db: AsyncSession, payload: dict) -> None:
    issue = await _load_issue(db, int(payload["issue_id"]))
    if issue is None:
        return

    owner_user_id = int(payload["owner_user_id"])
    actor_user_id = int(payload["actor_user_id"])
    if owner_user_id == actor_user_id:
        return

    recipient = await _get_active_user_with_permissions(db, owner_user_id)
    if recipient is None:
        return
    if not await can_read_issue_id(db, recipient, issue.id):
        return

    await NotificationService.create_notification(
        db=db,
        user_id=owner_user_id,
        notification_type=NotificationType.ISSUE_ASSIGNED,
        title=f"Issue assigned: {issue.title}",
        message=f"You have been assigned issue '{issue.title}'.",
        resource_type="issue",
        resource_id=issue.id,
    )


async def _handle_issue_exception_requested(db: AsyncSession, payload: dict) -> None:
    issue = await _load_issue(db, int(payload["issue_id"]))
    actor = await db.get(User, int(payload["actor_user_id"]))
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
        if recipient is None:
            continue
        if not await can_read_issue_id(db, recipient, issue.id):
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


async def _handle_issue_exception_approved(db: AsyncSession, payload: dict) -> None:
    issue = await _load_issue(db, int(payload["issue_id"]))
    actor = await db.get(User, int(payload["actor_user_id"]))
    if issue is None or actor is None:
        return

    requested_by_id = payload.get("requested_by_id")
    owner_user_id = payload.get("owner_user_id")
    recipient_ids = {int(uid) for uid in (requested_by_id, owner_user_id) if uid and int(uid) != actor.id}
    for user_id in recipient_ids:
        recipient = await _get_active_user_with_permissions(db, user_id)
        if recipient is None:
            continue
        if not await can_read_issue_id(db, recipient, issue.id):
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


async def _handle_questionnaire_sent(db: AsyncSession, payload: dict) -> None:
    questionnaire = await _load_questionnaire(db, int(payload["questionnaire_id"]))
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


async def _handle_questionnaire_submitted(db: AsyncSession, payload: dict) -> None:
    questionnaire = await _load_questionnaire(db, int(payload["questionnaire_id"]))
    actor = await db.get(User, int(payload["actor_user_id"]))
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


async def _handle_questionnaire_clarification_requested(db: AsyncSession, payload: dict) -> None:
    clarification = await _load_clarification(db, int(payload["clarification_id"]))
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


OUTBOX_EVENT_HANDLERS = {
    "approval.request_created": _handle_approval_request_created,
    "approval.request_resolved": _handle_approval_request_resolved,
    "approval.request_cancelled": _handle_approval_request_cancelled,
    "issue.assigned": _handle_issue_assigned,
    "issue.exception_requested": _handle_issue_exception_requested,
    "issue.exception_approved": _handle_issue_exception_approved,
    "questionnaire.sent": _handle_questionnaire_sent,
    "questionnaire.submitted": _handle_questionnaire_submitted,
    "questionnaire.clarification_requested": _handle_questionnaire_clarification_requested,
}


async def dispatch_pending_outbox_events(
    sessionmaker: async_sessionmaker[AsyncSession],
    *,
    batch_size: int = OUTBOX_BATCH_SIZE,
    lock_owner: str = "scheduler",
) -> int:
    """Claim a batch of outbox events and process them with isolated transactions."""
    async with sessionmaker() as claim_session:
        claimed_ids = await OutboxService.claim_batch(
            claim_session,
            batch_size=batch_size,
            lock_owner=lock_owner,
        )

    processed = 0
    for event_id in claimed_ids:
        async with sessionmaker() as session:
            event = await session.get(OutboxEvent, event_id)
            if event is None or event.status != "processing":
                continue

            handler = OUTBOX_EVENT_HANDLERS.get(event.event_type)
            if handler is None:
                await OutboxService.mark_retry(session, event_id, error_message=f"Unknown outbox event: {event.event_type}")
                continue

            try:
                await handler(session, event.payload)
                await OutboxService.mark_succeeded(session, event_id)
                processed += 1
            except Exception as exc:
                await session.rollback()
                async with sessionmaker() as retry_session:
                    await OutboxService.mark_retry(retry_session, event_id, error_message=str(exc))
                logger.exception(
                    "outbox_event_failed",
                    outbox_event_id=event_id,
                    event_type=event.event_type,
                    idempotency_key=event.idempotency_key,
                    error_message=str(exc),
                )

    if processed:
        logger.info("outbox_batch_processed", processed=processed)
    return processed
