from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.schemas.risk_questionnaire import (
    RiskQuestionnaireCapabilitiesRead,
    RiskQuestionnaireDraftUpdate,
    RiskQuestionnaireRead,
    RiskQuestionnaireSubmit,
)
from app.services.risk_questionnaire_service import (
    get_previous_submitted_questionnaire,
    load_questionnaire,
    open_questionnaire_for_user,
    questionnaire_capabilities,
    save_questionnaire_draft,
    submit_questionnaire_for_user,
)

from ._shared import (
    _get_questionnaire_for_read,
    _serialize_read_for_user,
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
    capabilities = RiskQuestionnaireCapabilitiesRead(**await questionnaire_capabilities(db, current_user, questionnaire))
    return _serialize_read_with_previous(questionnaire, previous_submission=previous, capabilities=capabilities)


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
    questionnaire = await load_questionnaire(db, questionnaire_id, for_update=True)
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    await _get_questionnaire_for_read(db, current_user, questionnaire_id)

    if questionnaire.status == RiskQuestionnaireStatus.sent:
        await open_questionnaire_for_user(db=db, questionnaire=questionnaire, current_user=current_user)
        await db.commit()
        questionnaire = await load_questionnaire(db, questionnaire_id)
        assert questionnaire is not None

    previous = None
    if include_previous:
        previous = await get_previous_submitted_questionnaire(db, questionnaire=questionnaire)
    capabilities = RiskQuestionnaireCapabilitiesRead(**await questionnaire_capabilities(db, current_user, questionnaire))
    return _serialize_read_with_previous(questionnaire, previous_submission=previous, capabilities=capabilities)


@router.patch("/{questionnaire_id}/draft", response_model=RiskQuestionnaireRead)
async def update_questionnaire_draft(
    questionnaire_id: int,
    payload: RiskQuestionnaireDraftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    questionnaire = await load_questionnaire(db, questionnaire_id, for_update=True)
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    await _get_questionnaire_for_read(db, current_user, questionnaire_id)
    await save_questionnaire_draft(
        db=db,
        questionnaire=questionnaire,
        current_user=current_user,
        answers=payload.answers,
    )
    await db.commit()
    questionnaire = await load_questionnaire(db, questionnaire_id)
    assert questionnaire is not None
    return await _serialize_read_for_user(db, current_user, questionnaire)


@router.post("/{questionnaire_id}/submit", response_model=RiskQuestionnaireRead)
async def submit_questionnaire(
    questionnaire_id: int,
    payload: RiskQuestionnaireSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    questionnaire = await load_questionnaire(db, questionnaire_id, for_update=True)
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    await _get_questionnaire_for_read(db, current_user, questionnaire_id)
    await submit_questionnaire_for_user(
        db=db,
        questionnaire=questionnaire,
        current_user=current_user,
        answers=payload.answers,
    )
    await db.commit()
    questionnaire = await load_questionnaire(db, questionnaire_id)
    assert questionnaire is not None
    return await _serialize_read_for_user(db, current_user, questionnaire)
