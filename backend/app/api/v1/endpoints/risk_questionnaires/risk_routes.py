from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import RiskQuestionnaire, User
from app.schemas.risk_questionnaire import RiskQuestionnaireListItemRead, RiskQuestionnaireRead
from app.services.risk_questionnaire_service import (
    can_send_questionnaire,
    load_questionnaire,
    questionnaire_load_options,
)
from app.services.risk_questionnaire_service import (
    send_questionnaire_for_risk as send_questionnaire_for_risk_workflow,
)
from app.services.transaction_boundary import commit_service_transaction

from ._shared import _get_risk_for_read, _serialize_list_item_for_user, _serialize_read_for_user

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
        .options(*questionnaire_load_options())
        .where(RiskQuestionnaire.risk_id == risk_id)
        .order_by(desc(RiskQuestionnaire.submitted_at), desc(RiskQuestionnaire.sent_at))
    )
    items = result.scalars().all()
    return [await _serialize_list_item_for_user(db, current_user, q) for q in items]


@router.post("/{risk_id}/questionnaires/send", response_model=RiskQuestionnaireRead, status_code=201)
async def send_questionnaire_for_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    if not can_send_questionnaire(current_user):
        raise HTTPException(status_code=403, detail="Only Risk Manager or CRO can send questionnaires")

    await _get_risk_for_read(db, current_user, risk_id)
    async with db.begin_nested():
        questionnaire = await send_questionnaire_for_risk_workflow(db=db, risk_id=risk_id, current_user=current_user)
    await commit_service_transaction(db)
    reloaded_questionnaire = await load_questionnaire(db, questionnaire.id)
    assert reloaded_questionnaire is not None
    return await _serialize_read_for_user(db, current_user, reloaded_questionnaire)
