"""Questionnaire-related outbox handlers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_risk_id
from app.core.user_query_options import user_selectinload_options
from app.i18n import t
from app.models import (
    NotificationType,
    RiskQuestionnaire,
    RiskQuestionnaireClarification,
    Role,
    User,
)
from app.models.role import RoleType
from app.services.notification_service import NotificationService
from app.services.outbox.payloads import (
    QuestionnaireClarificationRequestedPayload,
    QuestionnaireSentPayload,
    QuestionnaireSubmittedPayload,
)


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


async def _questionnaire_rm_cro_recipients(db: AsyncSession, *, actor_user_id: int) -> list[User]:
    recipients_stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(
            User.is_active.is_(True),
            User.id != actor_user_id,
            Role.name.in_([RoleType.RISK_MANAGER, RoleType.CRO]),
        )
        .options(*user_selectinload_options(include_permissions=True))
    )
    return list((await db.execute(recipients_stmt)).scalars().all())


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
