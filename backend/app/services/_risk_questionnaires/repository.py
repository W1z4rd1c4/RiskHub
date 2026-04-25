from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Risk, RiskQuestionnaire
from app.models.risk_questionnaire import RiskQuestionnaireStatus

from .validation import OPEN_QUESTIONNAIRE_STATUSES


def questionnaire_load_options():
    return (
        selectinload(RiskQuestionnaire.risk),
        selectinload(RiskQuestionnaire.assigned_to_user),
        selectinload(RiskQuestionnaire.sent_by_user),
        selectinload(RiskQuestionnaire.submitted_by_user),
    )


async def load_questionnaire(
    db: AsyncSession,
    questionnaire_id: int,
    *,
    for_update: bool = False,
) -> RiskQuestionnaire | None:
    stmt = (
        select(RiskQuestionnaire)
        .options(*questionnaire_load_options())
        .where(RiskQuestionnaire.id == questionnaire_id)
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def load_risk(
    db: AsyncSession,
    risk_id: int,
    *,
    for_update: bool = False,
) -> Risk | None:
    stmt = select(Risk).options(selectinload(Risk.owner), selectinload(Risk.department)).where(Risk.id == risk_id)
    if for_update:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def find_open_questionnaire_for_risk(db: AsyncSession, risk_id: int) -> RiskQuestionnaire | None:
    result = await db.execute(
        select(RiskQuestionnaire)
        .where(RiskQuestionnaire.risk_id == risk_id, RiskQuestionnaire.status.in_(OPEN_QUESTIONNAIRE_STATUSES))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_previous_submitted_questionnaire(
    db: AsyncSession,
    *,
    questionnaire: RiskQuestionnaire,
) -> RiskQuestionnaire | None:
    """
    "Previous cycle" lookup used for compare and reporting.

    Definition:
    - Previous cycle = previous submitted questionnaire for the same risk.
    - If current questionnaire is submitted: greatest submitted_at strictly before current submitted_at.
    - If current questionnaire is not submitted: greatest submitted_at overall.
    """
    base = select(RiskQuestionnaire).where(
        RiskQuestionnaire.risk_id == questionnaire.risk_id,
        RiskQuestionnaire.id != questionnaire.id,
        RiskQuestionnaire.status == RiskQuestionnaireStatus.submitted,
        RiskQuestionnaire.submitted_at.is_not(None),
    )

    if questionnaire.submitted_at is not None:
        base = base.where(RiskQuestionnaire.submitted_at < questionnaire.submitted_at)

    result = await db.execute(base.order_by(RiskQuestionnaire.submitted_at.desc()).limit(1))
    return result.scalar_one_or_none()
