from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import require_permission
from app.db.session import get_db
from app.models import RiskQuestionnaireClarification, User
from app.schemas.risk_questionnaire import (
    RiskQuestionnaireClarificationCreate,
    RiskQuestionnaireClarificationRead,
    RiskQuestionnaireClarificationRespond,
)
from app.services.risk_questionnaire_service import (
    request_questionnaire_clarification_detail,
    respond_questionnaire_clarification_detail,
)

from ._shared import _get_questionnaire_for_read, _serialize_clarification

router = APIRouter()


@router.post("/{questionnaire_id}/clarifications", response_model=RiskQuestionnaireClarificationRead, status_code=201)
async def create_questionnaire_clarification(
    questionnaire_id: int,
    payload: RiskQuestionnaireClarificationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireClarificationRead:
    outcome = await request_questionnaire_clarification_detail(
        db,
        questionnaire_id=questionnaire_id,
        current_user=current_user,
        section_key=payload.section_key,
        request_message=payload.request_message,
        question_keys=payload.question_keys,
    )
    return _serialize_clarification(outcome.clarification)


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
    outcome = await respond_questionnaire_clarification_detail(
        db,
        questionnaire_id=questionnaire_id,
        clarification_id=clarification_id,
        current_user=current_user,
        response_message=payload.response_message,
    )
    return _serialize_clarification(outcome.clarification)
