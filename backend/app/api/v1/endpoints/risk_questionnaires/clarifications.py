from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import require_permission
from app.db.session import get_db
from app.i18n import t
from app.models import RiskQuestionnaireClarification, User
from app.models.notification import NotificationType
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.schemas.risk_questionnaire import (
    RiskQuestionnaireClarificationCreate,
    RiskQuestionnaireClarificationRead,
    RiskQuestionnaireClarificationRespond,
)
from app.services.notification_service import NotificationService
from app.services.risk_questionnaire_service import can_send_questionnaire

from ._shared import _get_questionnaire_for_read, _serialize_clarification

router = APIRouter()


@router.post("/{questionnaire_id}/clarifications", response_model=RiskQuestionnaireClarificationRead, status_code=201)
async def create_questionnaire_clarification(
    questionnaire_id: int,
    payload: RiskQuestionnaireClarificationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireClarificationRead:
    if not can_send_questionnaire(current_user):
        raise HTTPException(status_code=403, detail="Only Risk Manager or CRO can request clarifications")

    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)
    if questionnaire.status != RiskQuestionnaireStatus.submitted:
        raise HTTPException(status_code=409, detail="Clarifications can only be requested for submitted questionnaires")

    clarification = RiskQuestionnaireClarification(
        questionnaire_id=questionnaire.id,
        section_key=payload.section_key,
        question_keys=payload.question_keys,
        request_message=payload.request_message,
        requested_by_user_id=current_user.id,
    )
    db.add(clarification)
    await db.flush()

    # Notify assignee (Risk Owner)
    assignee = questionnaire.assigned_to_user
    if assignee:
        locale = assignee.preferred_language or "en"
        await NotificationService.create_notification(
            db=db,
            user_id=assignee.id,
            notification_type=NotificationType.QUESTIONNAIRE_CLARIFICATION_REQUESTED,
            title=t("notifications.questionnaire_clarification_requested_title", locale=locale),
            message=t(
                "notifications.questionnaire_clarification_requested_message",
                locale=locale,
                risk_name=questionnaire.risk.name if questionnaire.risk else "Risk",
            ),
            resource_type="risk",
            resource_id=questionnaire.risk_id,
        )

    await db.commit()

    result = await db.execute(
        select(RiskQuestionnaireClarification)
        .options(
            selectinload(RiskQuestionnaireClarification.requested_by_user),
            selectinload(RiskQuestionnaireClarification.responded_by_user),
        )
        .where(RiskQuestionnaireClarification.id == clarification.id)
    )
    clarification = result.scalar_one()
    return _serialize_clarification(clarification)


@router.get("/{questionnaire_id}/clarifications", response_model=list[RiskQuestionnaireClarificationRead])
async def list_questionnaire_clarifications(
    questionnaire_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> list[RiskQuestionnaireClarificationRead]:
    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)

    result = await db.execute(
        select(RiskQuestionnaireClarification)
        .options(
            selectinload(RiskQuestionnaireClarification.requested_by_user),
            selectinload(RiskQuestionnaireClarification.responded_by_user),
        )
        .where(RiskQuestionnaireClarification.questionnaire_id == questionnaire.id)
        .order_by(RiskQuestionnaireClarification.requested_at.asc())
    )
    items = result.scalars().all()
    return [_serialize_clarification(c) for c in items]


@router.post(
    "/{questionnaire_id}/clarifications/{clarification_id}/respond",
    response_model=RiskQuestionnaireClarificationRead,
)
async def respond_to_questionnaire_clarification(
    questionnaire_id: int,
    clarification_id: int,
    payload: RiskQuestionnaireClarificationRespond,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireClarificationRead:
    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)
    if questionnaire.assigned_to_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the Risk Owner can respond to clarifications")

    result = await db.execute(
        select(RiskQuestionnaireClarification)
        .options(
            selectinload(RiskQuestionnaireClarification.requested_by_user),
            selectinload(RiskQuestionnaireClarification.responded_by_user),
        )
        .where(
            RiskQuestionnaireClarification.id == clarification_id,
            RiskQuestionnaireClarification.questionnaire_id == questionnaire.id,
        )
    )
    clarification = result.scalar_one_or_none()
    if clarification is None:
        raise HTTPException(status_code=404, detail="Clarification not found")
    if clarification.response_message is not None:
        raise HTTPException(status_code=409, detail="Clarification has already been responded to")

    clarification.response_message = payload.response_message
    clarification.responded_by_user_id = current_user.id
    clarification.responded_at = datetime.now(UTC)
    await db.commit()

    result = await db.execute(
        select(RiskQuestionnaireClarification)
        .options(
            selectinload(RiskQuestionnaireClarification.requested_by_user),
            selectinload(RiskQuestionnaireClarification.responded_by_user),
        )
        .where(RiskQuestionnaireClarification.id == clarification.id)
    )
    clarification = result.scalar_one()
    return _serialize_clarification(clarification)

