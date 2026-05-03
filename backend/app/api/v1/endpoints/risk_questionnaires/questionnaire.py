from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.risk_questionnaire import (
    RiskQuestionnaireCapabilitiesRead,
    RiskQuestionnaireDraftUpdate,
    RiskQuestionnaireRead,
    RiskQuestionnaireSubmit,
)
from app.services.risk_questionnaire_service import (
    QuestionnaireLifecycleOptions,
    open_questionnaire_detail,
    read_questionnaire_detail,
    save_questionnaire_draft_detail,
    submit_questionnaire_detail,
)

from ._shared import (
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
    outcome = await read_questionnaire_detail(
        db,
        questionnaire_id=questionnaire_id,
        current_user=current_user,
        options=QuestionnaireLifecycleOptions(include_previous=include_previous),
    )
    return _serialize_read_with_previous(
        outcome.questionnaire,
        previous_submission=outcome.previous_submission,
        capabilities=RiskQuestionnaireCapabilitiesRead(**outcome.capabilities),
    )


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
    outcome = await open_questionnaire_detail(
        db,
        questionnaire_id=questionnaire_id,
        current_user=current_user,
        options=QuestionnaireLifecycleOptions(include_previous=include_previous),
    )
    return _serialize_read_with_previous(
        outcome.questionnaire,
        previous_submission=outcome.previous_submission,
        capabilities=RiskQuestionnaireCapabilitiesRead(**outcome.capabilities),
    )


@router.patch("/{questionnaire_id}/draft", response_model=RiskQuestionnaireRead)
async def update_questionnaire_draft(
    questionnaire_id: int,
    payload: RiskQuestionnaireDraftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    outcome = await save_questionnaire_draft_detail(
        db,
        questionnaire_id=questionnaire_id,
        current_user=current_user,
        answers=payload.answers,
    )
    return _serialize_read_with_previous(
        outcome.questionnaire,
        previous_submission=outcome.previous_submission,
        capabilities=RiskQuestionnaireCapabilitiesRead(**outcome.capabilities),
    )


@router.post("/{questionnaire_id}/submit", response_model=RiskQuestionnaireRead)
async def submit_questionnaire(
    questionnaire_id: int,
    payload: RiskQuestionnaireSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> RiskQuestionnaireRead:
    outcome = await submit_questionnaire_detail(
        db,
        questionnaire_id=questionnaire_id,
        current_user=current_user,
        answers=payload.answers,
    )
    return _serialize_read_with_previous(
        outcome.questionnaire,
        previous_submission=outcome.previous_submission,
        capabilities=RiskQuestionnaireCapabilitiesRead(**outcome.capabilities),
    )
