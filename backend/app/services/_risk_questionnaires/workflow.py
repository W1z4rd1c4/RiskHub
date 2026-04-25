from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_risk_id
from app.models import Risk, RiskQuestionnaire, RiskQuestionnaireClarification, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.services.outbox import OutboxService

from .policy import can_act_on_questionnaire, can_request_questionnaire_clarification, can_send_questionnaire
from .repository import find_open_questionnaire_for_risk, load_risk
from .validation import (
    OPEN_QUESTIONNAIRE_STATUSES,
    QUESTIONNAIRE_TEMPLATE_KEY,
    QUESTIONNAIRE_TEMPLATE_VERSION,
    validate_submit_answers,
)


async def create_questionnaire_instance(
    *,
    db: AsyncSession,
    risk: Risk,
    assigned_to_user_id: int,
    sent_by_user_id: int,
    template_key: str,
    template_version: str,
    sent_at: datetime,
    due_at: datetime,
) -> RiskQuestionnaire:
    questionnaire = RiskQuestionnaire(
        risk_id=risk.id,
        assigned_to_user_id=assigned_to_user_id,
        sent_by_user_id=sent_by_user_id,
        status=RiskQuestionnaireStatus.sent,
        template_key=template_key,
        template_version=template_version,
        answers=None,
        sent_at=sent_at,
        due_at=due_at,
        submitted_at=None,
        submitted_by_user_id=None,
    )
    db.add(questionnaire)
    await db.flush()
    return questionnaire


async def send_questionnaire_for_risk(
    *,
    db: AsyncSession,
    risk_id: int,
    current_user: User,
    now: datetime | None = None,
) -> RiskQuestionnaire:
    if not can_send_questionnaire(current_user):
        raise HTTPException(status_code=403, detail="Only Risk Manager or CRO can send questionnaires")

    risk = await load_risk(db, risk_id, for_update=True)
    if risk is None or not await can_read_risk_id(db, current_user, risk_id):
        raise HTTPException(status_code=404, detail="Risk not found")
    if risk.owner_id is None:
        raise HTTPException(status_code=400, detail="Risk owner must be set before sending a questionnaire")

    existing_open = await find_open_questionnaire_for_risk(db, risk_id)
    if existing_open is not None:
        raise HTTPException(status_code=409, detail="An open questionnaire already exists for this risk")

    now = now or utc_now()
    try:
        questionnaire = await create_questionnaire_instance(
            db=db,
            risk=risk,
            assigned_to_user_id=risk.owner_id,
            sent_by_user_id=current_user.id,
            template_key=QUESTIONNAIRE_TEMPLATE_KEY,
            template_version=QUESTIONNAIRE_TEMPLATE_VERSION,
            sent_at=now,
            due_at=now + timedelta(days=15),
        )
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An open questionnaire already exists for this risk") from exc

    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK_QUESTIONNAIRE,
        entity_id=questionnaire.id,
        entity_name=f"{risk.name} questionnaire",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=risk.department_id,
        description=f"Sent questionnaire for risk '{risk.name}'",
    )
    await OutboxService.enqueue(
        db,
        event_type="questionnaire.sent",
        aggregate_type="risk_questionnaire",
        aggregate_id=questionnaire.id,
        idempotency_key=f"questionnaire:{questionnaire.id}:sent",
        payload={
            "questionnaire_id": questionnaire.id,
            "actor_user_id": current_user.id,
        },
    )
    return questionnaire


async def open_questionnaire_for_user(
    *,
    db: AsyncSession,
    questionnaire: RiskQuestionnaire,
    current_user: User,
) -> RiskQuestionnaire:
    if questionnaire.status == RiskQuestionnaireStatus.sent:
        if not can_act_on_questionnaire(current_user, questionnaire):
            raise HTTPException(status_code=403, detail="Not allowed to open this questionnaire")
        questionnaire.status = RiskQuestionnaireStatus.in_progress
        await db.flush()
    return questionnaire


async def save_questionnaire_draft(
    *,
    db: AsyncSession,
    questionnaire: RiskQuestionnaire,
    current_user: User,
    answers: dict[str, object],
) -> RiskQuestionnaire:
    if not can_act_on_questionnaire(current_user, questionnaire):
        raise HTTPException(status_code=403, detail="Not allowed to update this questionnaire")
    if questionnaire.status not in OPEN_QUESTIONNAIRE_STATUSES:
        raise HTTPException(status_code=409, detail="Questionnaire can no longer be edited")

    questionnaire.answers = answers
    questionnaire.status = RiskQuestionnaireStatus.in_progress
    await db.flush()
    return questionnaire


async def submit_questionnaire_for_user(
    *,
    db: AsyncSession,
    questionnaire: RiskQuestionnaire,
    current_user: User,
    answers: dict[str, object],
) -> RiskQuestionnaire:
    if not can_act_on_questionnaire(current_user, questionnaire):
        raise HTTPException(status_code=403, detail="Not allowed to submit this questionnaire")
    if questionnaire.status not in OPEN_QUESTIONNAIRE_STATUSES:
        raise HTTPException(status_code=409, detail="Questionnaire has already been submitted")

    missing, invalid = validate_submit_answers(template_version=questionnaire.template_version, answers=answers)
    if missing or invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Missing or invalid questionnaire answers",
                "missing": sorted(missing),
                "invalid": invalid,
            },
        )

    questionnaire.answers = answers
    old_status = questionnaire.status
    questionnaire.status = RiskQuestionnaireStatus.submitted
    questionnaire.submitted_at = utc_now()
    questionnaire.submitted_by_user_id = current_user.id

    risk = questionnaire.risk
    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK_QUESTIONNAIRE,
        entity_id=questionnaire.id,
        entity_name=f"{risk.name if risk else 'Risk'} questionnaire",
        action=ActivityAction.STATUS_CHANGE,
        actor=current_user,
        department_id=risk.department_id if risk else None,
        changes={
            "status": {"old": old_status.value if hasattr(old_status, "value") else old_status, "new": "submitted"}
        },
        description=f"Submitted questionnaire for risk '{risk.name if risk else 'Risk'}'",
    )
    await OutboxService.enqueue(
        db,
        event_type="questionnaire.submitted",
        aggregate_type="risk_questionnaire",
        aggregate_id=questionnaire.id,
        idempotency_key=f"questionnaire:{questionnaire.id}:submitted",
        payload={
            "questionnaire_id": questionnaire.id,
            "actor_user_id": current_user.id,
        },
    )
    await db.flush()
    return questionnaire


async def request_questionnaire_clarification(
    *,
    db: AsyncSession,
    questionnaire: RiskQuestionnaire,
    current_user: User,
    section_key: str,
    request_message: str,
    question_keys: list[str] | None,
) -> RiskQuestionnaireClarification:
    if not await can_request_questionnaire_clarification(db, current_user, questionnaire):
        raise HTTPException(status_code=403, detail="Only Risk Manager or CRO can request clarifications")
    if questionnaire.status != RiskQuestionnaireStatus.submitted:
        raise HTTPException(status_code=409, detail="Clarifications can only be requested for submitted questionnaires")

    clarification = RiskQuestionnaireClarification(
        questionnaire_id=questionnaire.id,
        section_key=section_key,
        question_keys=question_keys,
        request_message=request_message,
        requested_by_user_id=current_user.id,
    )
    db.add(clarification)
    await db.flush()
    await OutboxService.enqueue(
        db,
        event_type="questionnaire.clarification_requested",
        aggregate_type="risk_questionnaire_clarification",
        aggregate_id=clarification.id,
        idempotency_key=f"questionnaire:{questionnaire.id}:clarification:{clarification.id}",
        payload={
            "clarification_id": clarification.id,
            "questionnaire_id": questionnaire.id,
            "actor_user_id": current_user.id,
        },
    )
    return clarification


async def respond_to_questionnaire_clarification(
    *,
    db: AsyncSession,
    questionnaire: RiskQuestionnaire,
    clarification_id: int,
    current_user: User,
    response_message: str,
) -> RiskQuestionnaireClarification:
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
        .with_for_update()
    )
    clarification = result.scalar_one_or_none()
    if clarification is None:
        raise HTTPException(status_code=404, detail="Clarification not found")
    if clarification.response_message is not None:
        raise HTTPException(status_code=409, detail="Clarification has already been responded to")

    clarification.response_message = response_message
    clarification.responded_by_user_id = current_user.id
    clarification.responded_at = utc_now()
    await db.flush()
    return clarification
