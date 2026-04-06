from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.core.security import require_permission
from app.db.session import get_db
from app.i18n import t
from app.models import RiskQuestionnaire, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.risk_questionnaire import RiskQuestionnaireListItemRead, RiskQuestionnaireRead
from app.services.outbox import OutboxService
from app.services.risk_questionnaire_service import (
    QUESTIONNAIRE_TEMPLATE_KEY,
    QUESTIONNAIRE_TEMPLATE_VERSION,
    can_send_questionnaire,
    create_questionnaire_instance,
    find_open_questionnaire_for_risk,
)

from ._shared import _get_risk_for_read, _serialize_list_item, _serialize_read

router = APIRouter()


@router.get("/{risk_id}/questionnaires", response_model=list[RiskQuestionnaireListItemRead])
async def list_questionnaires_for_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> list[RiskQuestionnaireListItemRead]:
    await _get_risk_for_read(db, current_user, risk_id)

    result = await db.execute(
        select(RiskQuestionnaire)
        .options(
            selectinload(RiskQuestionnaire.risk),
            selectinload(RiskQuestionnaire.assigned_to_user),
            selectinload(RiskQuestionnaire.sent_by_user),
            selectinload(RiskQuestionnaire.submitted_by_user),
        )
        .where(RiskQuestionnaire.risk_id == risk_id)
        .order_by(desc(RiskQuestionnaire.submitted_at), desc(RiskQuestionnaire.sent_at))
    )
    items = result.scalars().all()
    return [_serialize_list_item(q) for q in items]


@router.post("/{risk_id}/questionnaires/send", response_model=RiskQuestionnaireRead, status_code=201)
async def send_questionnaire_for_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    if not can_send_questionnaire(current_user):
        raise HTTPException(status_code=403, detail="Only Risk Manager or CRO can send questionnaires")

    risk = await _get_risk_for_read(db, current_user, risk_id)
    if risk.owner_id is None:
        raise HTTPException(status_code=400, detail="Risk owner must be set before sending a questionnaire")

    existing_open = await find_open_questionnaire_for_risk(db, risk_id)
    if existing_open is not None:
        raise HTTPException(status_code=409, detail="An open questionnaire already exists for this risk")

    questionnaire = await create_questionnaire_instance(
        db=db,
        risk=risk,
        assigned_to_user_id=risk.owner_id,
        sent_by_user_id=current_user.id,
        template_key=QUESTIONNAIRE_TEMPLATE_KEY,
        template_version=QUESTIONNAIRE_TEMPLATE_VERSION,
        sent_at=datetime.now(UTC),
        due_at=datetime.now(UTC) + timedelta(days=15),
    )

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
    await db.commit()
    await db.refresh(questionnaire)

    result = await db.execute(
        select(RiskQuestionnaire)
        .options(
            selectinload(RiskQuestionnaire.assigned_to_user),
            selectinload(RiskQuestionnaire.sent_by_user),
            selectinload(RiskQuestionnaire.submitted_by_user),
        )
        .where(RiskQuestionnaire.id == questionnaire.id)
    )
    questionnaire = result.scalar_one()
    return _serialize_read(questionnaire)
