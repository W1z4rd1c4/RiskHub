from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.core.permissions import can_read_risk_id
from app.core.security import require_permission
from app.db.session import get_db
from app.i18n import t
from app.models import Role, RolePermission, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.notification import NotificationType
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.models.role import RoleType
from app.schemas.risk_questionnaire import (
    RiskQuestionnaireDraftUpdate,
    RiskQuestionnaireRead,
    RiskQuestionnaireSubmit,
)
from app.services.notification_service import NotificationService
from app.services.risk_questionnaire_service import (
    can_submit_questionnaire,
    get_previous_submitted_questionnaire,
    validate_submit_answers,
)

from ._shared import (
    _get_questionnaire_for_read,
    _serialize_read,
    _serialize_read_with_previous,
)

router = APIRouter()


@router.get("/{questionnaire_id}", response_model=RiskQuestionnaireRead)
async def get_questionnaire(
    questionnaire_id: int,
    include_previous: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)

    previous = None
    if include_previous:
        previous = await get_previous_submitted_questionnaire(db, questionnaire=questionnaire)
    return _serialize_read_with_previous(questionnaire, previous_submission=previous)


@router.post("/{questionnaire_id}/open", response_model=RiskQuestionnaireRead)
async def open_questionnaire(
    questionnaire_id: int,
    include_previous: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    """
    Explicitly transition a questionnaire from sent -> in_progress.

    This preserves the "opening starts progress" UX without causing side effects on GET.
    """
    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)
    risk = questionnaire.risk

    if questionnaire.status == RiskQuestionnaireStatus.sent:
        if not can_submit_questionnaire(current_user, risk):
            raise HTTPException(status_code=403, detail="Not allowed to open this questionnaire")
        questionnaire.status = RiskQuestionnaireStatus.in_progress
        await db.commit()
        await db.refresh(questionnaire)

    previous = None
    if include_previous:
        previous = await get_previous_submitted_questionnaire(db, questionnaire=questionnaire)
    return _serialize_read_with_previous(questionnaire, previous_submission=previous)


@router.patch("/{questionnaire_id}/draft", response_model=RiskQuestionnaireRead)
async def update_questionnaire_draft(
    questionnaire_id: int,
    payload: RiskQuestionnaireDraftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)
    if not can_submit_questionnaire(current_user, questionnaire.risk):
        raise HTTPException(status_code=403, detail="Not allowed to update this questionnaire")
    if questionnaire.status not in (RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress):
        raise HTTPException(status_code=409, detail="Questionnaire can no longer be edited")

    questionnaire.answers = payload.answers
    questionnaire.status = RiskQuestionnaireStatus.in_progress
    await db.commit()
    await db.refresh(questionnaire)
    return _serialize_read(questionnaire)


@router.post("/{questionnaire_id}/submit", response_model=RiskQuestionnaireRead)
async def submit_questionnaire(
    questionnaire_id: int,
    payload: RiskQuestionnaireSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)
    if not can_submit_questionnaire(current_user, questionnaire.risk):
        raise HTTPException(status_code=403, detail="Not allowed to submit this questionnaire")
    if questionnaire.status not in (RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress):
        raise HTTPException(status_code=409, detail="Questionnaire has already been submitted")

    missing, invalid = validate_submit_answers(template_version=questionnaire.template_version, answers=payload.answers)
    if missing or invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Missing or invalid questionnaire answers",
                "missing": sorted(missing),
                "invalid": invalid,
            },
        )

    questionnaire.answers = payload.answers
    old_status = questionnaire.status
    questionnaire.status = RiskQuestionnaireStatus.submitted
    questionnaire.submitted_at = datetime.now(UTC)
    questionnaire.submitted_by_user_id = current_user.id

    # Notify RM/CRO recipients (localized per recipient), filtered by visibility to avoid cross-scope leaks.
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    recipients_stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(
            User.is_active.is_(True),
            User.id != current_user.id,
            Role.name.in_([RoleType.RISK_MANAGER, RoleType.CRO]),
        )
        .options(permission_load)
    )
    recipients = (await db.execute(recipients_stmt)).scalars().all()
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
                actor_name=current_user.name,
                risk_name=questionnaire.risk.name if questionnaire.risk else "Risk",
            ),
            resource_type="risk",
            resource_id=questionnaire.risk_id,
        )

    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK_QUESTIONNAIRE,
        entity_id=questionnaire.id,
        entity_name=f"{questionnaire.risk.name if questionnaire.risk else 'Risk'} questionnaire",
        action=ActivityAction.STATUS_CHANGE,
        actor=current_user,
        department_id=questionnaire.risk.department_id if questionnaire.risk else None,
        changes={
            "status": {"old": old_status.value if hasattr(old_status, "value") else old_status, "new": "submitted"}
        },
        description=f"Submitted questionnaire for risk '{questionnaire.risk.name if questionnaire.risk else 'Risk'}'",
    )
    await db.commit()
    await db.refresh(questionnaire)
    return _serialize_read(questionnaire)
