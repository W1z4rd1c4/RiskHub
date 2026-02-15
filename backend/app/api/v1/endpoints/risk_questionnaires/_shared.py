from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import check_department_access
from app.models import Risk, RiskQuestionnaire, RiskQuestionnaireClarification, User
from app.schemas.risk_questionnaire import (
    RiskQuestionnaireClarificationRead,
    RiskQuestionnaireListItemRead,
    RiskQuestionnaireRead,
)


async def _get_risk_for_read(db: AsyncSession, current_user: User, risk_id: int) -> Risk:
    from app.core.permissions import is_risk_control_owner, is_risk_kri_reporting_owner

    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")

    if await is_risk_kri_reporting_owner(db, current_user.id, risk_id):
        return risk
    if await is_risk_control_owner(db, current_user.id, risk_id):
        return risk

    try:
        check_department_access(risk.department_id, current_user)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Risk not found")

    return risk


async def _get_questionnaire_for_read(
    db: AsyncSession,
    current_user: User,
    questionnaire_id: int,
) -> RiskQuestionnaire:
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
    questionnaire = result.scalar_one_or_none()
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")

    await _get_risk_for_read(db, current_user, questionnaire.risk_id)
    return questionnaire


def _serialize_list_item(q: RiskQuestionnaire) -> RiskQuestionnaireListItemRead:
    return RiskQuestionnaireListItemRead(
        id=q.id,
        risk_id=q.risk_id,
        risk_name=getattr(getattr(q, "risk", None), "name", None),
        assigned_to_user_id=q.assigned_to_user_id,
        sent_by_user_id=q.sent_by_user_id,
        status=q.status.value if hasattr(q.status, "value") else q.status,
        template_key=q.template_key,
        template_version=q.template_version,
        sent_at=q.sent_at,
        due_at=q.due_at,
        submitted_at=q.submitted_at,
        submitted_by_user_id=q.submitted_by_user_id,
        assigned_to_user_name=getattr(getattr(q, "assigned_to_user", None), "name", None),
        sent_by_user_name=getattr(getattr(q, "sent_by_user", None), "name", None),
        submitted_by_user_name=getattr(getattr(q, "submitted_by_user", None), "name", None),
    )


def _serialize_read(q: RiskQuestionnaire) -> RiskQuestionnaireRead:
    base = _serialize_list_item(q).model_dump()
    return RiskQuestionnaireRead(**base, answers=q.answers, previous_submission=None)


def _serialize_previous_submission(q: RiskQuestionnaire | None) -> dict | None:
    if q is None or q.submitted_at is None:
        return None
    return {
        "id": q.id,
        "submitted_at": q.submitted_at,
        "template_version": q.template_version,
        "answers": q.answers,
    }


def _serialize_read_with_previous(
    q: RiskQuestionnaire,
    *,
    previous_submission: RiskQuestionnaire | None,
) -> RiskQuestionnaireRead:
    base = _serialize_list_item(q).model_dump()
    return RiskQuestionnaireRead(
        **base,
        answers=q.answers,
        previous_submission=_serialize_previous_submission(previous_submission),
    )


def _serialize_clarification(c: RiskQuestionnaireClarification) -> RiskQuestionnaireClarificationRead:
    return RiskQuestionnaireClarificationRead(
        id=c.id,
        questionnaire_id=c.questionnaire_id,
        section_key=c.section_key,
        question_keys=c.question_keys,
        request_message=c.request_message,
        requested_by_user_id=c.requested_by_user_id,
        requested_by_user_name=getattr(getattr(c, "requested_by_user", None), "name", None),
        requested_at=c.requested_at,
        response_message=c.response_message,
        responded_by_user_id=c.responded_by_user_id,
        responded_by_user_name=getattr(getattr(c, "responded_by_user", None), "name", None),
        responded_at=c.responded_at,
    )

