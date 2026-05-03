from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import RiskQuestionnaire, RiskQuestionnaireClarification, User
from app.models.risk_questionnaire import RiskQuestionnaireStatus

from .policy import can_read_questionnaire, questionnaire_capabilities
from .repository import get_previous_submitted_questionnaire, load_questionnaire
from .workflow import (
    open_questionnaire_for_user,
    request_questionnaire_clarification,
    respond_to_questionnaire_clarification,
    save_questionnaire_draft,
    submit_questionnaire_for_user,
)


@dataclass(frozen=True)
class QuestionnaireLifecycleOptions:
    include_previous: bool = False
    reload_after_mutation: bool = True


@dataclass(frozen=True)
class QuestionnaireLifecycleOutcome:
    questionnaire: RiskQuestionnaire
    capabilities: dict[str, bool]
    previous_submission: RiskQuestionnaire | None = None


@dataclass(frozen=True)
class QuestionnaireClarificationOutcome:
    clarification: RiskQuestionnaireClarification
    questionnaire: RiskQuestionnaire
    capabilities: dict[str, bool]
    previous_submission: RiskQuestionnaire | None = None


async def _assert_questionnaire_readable(
    db: AsyncSession,
    *,
    current_user: User,
    questionnaire: RiskQuestionnaire | None,
) -> RiskQuestionnaire:
    if questionnaire is None:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    if not await can_read_questionnaire(db, current_user, questionnaire):
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    return questionnaire


async def _build_outcome(
    db: AsyncSession,
    *,
    current_user: User,
    questionnaire: RiskQuestionnaire,
    options: QuestionnaireLifecycleOptions,
) -> QuestionnaireLifecycleOutcome:
    previous = None
    if options.include_previous:
        previous = await get_previous_submitted_questionnaire(db, questionnaire=questionnaire)
    return QuestionnaireLifecycleOutcome(
        questionnaire=questionnaire,
        capabilities=await questionnaire_capabilities(db, current_user, questionnaire),
        previous_submission=previous,
    )


async def read_questionnaire_detail(
    db: AsyncSession,
    *,
    questionnaire_id: int,
    current_user: User,
    options: QuestionnaireLifecycleOptions | None = None,
) -> QuestionnaireLifecycleOutcome:
    lifecycle_options = options or QuestionnaireLifecycleOptions()
    questionnaire = await _assert_questionnaire_readable(
        db,
        current_user=current_user,
        questionnaire=await load_questionnaire(db, questionnaire_id),
    )
    return await _build_outcome(db, current_user=current_user, questionnaire=questionnaire, options=lifecycle_options)


async def open_questionnaire_detail(
    db: AsyncSession,
    *,
    questionnaire_id: int,
    current_user: User,
    options: QuestionnaireLifecycleOptions | None = None,
) -> QuestionnaireLifecycleOutcome:
    lifecycle_options = options or QuestionnaireLifecycleOptions()
    questionnaire = await _assert_questionnaire_readable(
        db,
        current_user=current_user,
        questionnaire=await load_questionnaire(db, questionnaire_id, for_update=True),
    )

    opened = questionnaire.status == RiskQuestionnaireStatus.sent
    if opened:
        await open_questionnaire_for_user(db=db, questionnaire=questionnaire, current_user=current_user)
        await db.commit()
        if lifecycle_options.reload_after_mutation:
            questionnaire = await _assert_questionnaire_readable(
                db,
                current_user=current_user,
                questionnaire=await load_questionnaire(db, questionnaire_id),
            )

    return await _build_outcome(db, current_user=current_user, questionnaire=questionnaire, options=lifecycle_options)


async def save_questionnaire_draft_detail(
    db: AsyncSession,
    *,
    questionnaire_id: int,
    current_user: User,
    answers: dict[str, object],
    options: QuestionnaireLifecycleOptions | None = None,
) -> QuestionnaireLifecycleOutcome:
    lifecycle_options = options or QuestionnaireLifecycleOptions()
    questionnaire = await _assert_questionnaire_readable(
        db,
        current_user=current_user,
        questionnaire=await load_questionnaire(db, questionnaire_id, for_update=True),
    )
    await save_questionnaire_draft(
        db=db,
        questionnaire=questionnaire,
        current_user=current_user,
        answers=answers,
    )
    await db.commit()
    if lifecycle_options.reload_after_mutation:
        questionnaire = await _assert_questionnaire_readable(
            db,
            current_user=current_user,
            questionnaire=await load_questionnaire(db, questionnaire_id),
        )
    return await _build_outcome(db, current_user=current_user, questionnaire=questionnaire, options=lifecycle_options)


async def submit_questionnaire_detail(
    db: AsyncSession,
    *,
    questionnaire_id: int,
    current_user: User,
    answers: dict[str, object],
    options: QuestionnaireLifecycleOptions | None = None,
) -> QuestionnaireLifecycleOutcome:
    lifecycle_options = options or QuestionnaireLifecycleOptions()
    questionnaire = await _assert_questionnaire_readable(
        db,
        current_user=current_user,
        questionnaire=await load_questionnaire(db, questionnaire_id, for_update=True),
    )
    await submit_questionnaire_for_user(
        db=db,
        questionnaire=questionnaire,
        current_user=current_user,
        answers=answers,
    )
    await db.commit()
    if lifecycle_options.reload_after_mutation:
        questionnaire = await _assert_questionnaire_readable(
            db,
            current_user=current_user,
            questionnaire=await load_questionnaire(db, questionnaire_id),
        )
    return await _build_outcome(db, current_user=current_user, questionnaire=questionnaire, options=lifecycle_options)


async def _load_clarification_with_users(
    db: AsyncSession,
    clarification_id: int,
) -> RiskQuestionnaireClarification:
    result = await db.execute(
        select(RiskQuestionnaireClarification)
        .options(
            selectinload(RiskQuestionnaireClarification.requested_by_user),
            selectinload(RiskQuestionnaireClarification.responded_by_user),
        )
        .where(RiskQuestionnaireClarification.id == clarification_id)
    )
    return result.scalar_one()


async def request_questionnaire_clarification_detail(
    db: AsyncSession,
    *,
    questionnaire_id: int,
    current_user: User,
    section_key: str,
    request_message: str,
    question_keys: list[str] | None,
    options: QuestionnaireLifecycleOptions | None = None,
) -> QuestionnaireClarificationOutcome:
    lifecycle_options = options or QuestionnaireLifecycleOptions()
    questionnaire = await _assert_questionnaire_readable(
        db,
        current_user=current_user,
        questionnaire=await load_questionnaire(db, questionnaire_id, for_update=True),
    )
    clarification = await request_questionnaire_clarification(
        db=db,
        questionnaire=questionnaire,
        current_user=current_user,
        section_key=section_key,
        request_message=request_message,
        question_keys=question_keys,
    )
    await db.commit()
    clarification = await _load_clarification_with_users(db, clarification.id)
    outcome = await _build_outcome(
        db,
        current_user=current_user,
        questionnaire=questionnaire,
        options=lifecycle_options,
    )
    return QuestionnaireClarificationOutcome(
        clarification=clarification,
        questionnaire=outcome.questionnaire,
        capabilities=outcome.capabilities,
        previous_submission=outcome.previous_submission,
    )


async def respond_questionnaire_clarification_detail(
    db: AsyncSession,
    *,
    questionnaire_id: int,
    clarification_id: int,
    current_user: User,
    response_message: str,
    options: QuestionnaireLifecycleOptions | None = None,
) -> QuestionnaireClarificationOutcome:
    lifecycle_options = options or QuestionnaireLifecycleOptions()
    questionnaire = await _assert_questionnaire_readable(
        db,
        current_user=current_user,
        questionnaire=await load_questionnaire(db, questionnaire_id, for_update=True),
    )
    clarification = await respond_to_questionnaire_clarification(
        db=db,
        questionnaire=questionnaire,
        clarification_id=clarification_id,
        current_user=current_user,
        response_message=response_message,
    )
    await db.commit()
    clarification = await _load_clarification_with_users(db, clarification.id)
    outcome = await _build_outcome(
        db,
        current_user=current_user,
        questionnaire=questionnaire,
        options=lifecycle_options,
    )
    return QuestionnaireClarificationOutcome(
        clarification=clarification,
        questionnaire=outcome.questionnaire,
        capabilities=outcome.capabilities,
        previous_submission=outcome.previous_submission,
    )
