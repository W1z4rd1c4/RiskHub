from sqlalchemy import Select, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import risk_visibility_clause
from app.models import Risk, RiskQuestionnaire
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.models.role import RoleType
from app.models.user import User

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


async def questionnaire_inbox_query(db: AsyncSession, current_user: User) -> Select[tuple[RiskQuestionnaire]]:
    owner_clause = RiskQuestionnaire.assigned_to_user_id == current_user.id
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    action_clause = owner_clause
    if role_name == RoleType.DEPARTMENT_HEAD and current_user.department_id is not None:
        action_clause = or_(owner_clause, Risk.department_id == current_user.department_id)

    query = (
        select(RiskQuestionnaire)
        .join(Risk, Risk.id == RiskQuestionnaire.risk_id)
        .where(
            RiskQuestionnaire.status.in_(OPEN_QUESTIONNAIRE_STATUSES),
            action_clause,
        )
    )

    visibility_clause = await risk_visibility_clause(db, current_user)
    if visibility_clause is not None:
        query = query.where(visibility_clause)

    return query


async def list_questionnaire_inbox(db: AsyncSession, current_user: User) -> list[RiskQuestionnaire]:
    query = (await questionnaire_inbox_query(db, current_user)).options(*questionnaire_load_options())
    result = await db.execute(query.order_by(desc(RiskQuestionnaire.due_at), desc(RiskQuestionnaire.id)))
    return list(result.scalars().all())


async def count_questionnaire_inbox(db: AsyncSession, current_user: User) -> int:
    inbox_subquery = (
        (await questionnaire_inbox_query(db, current_user)).with_only_columns(RiskQuestionnaire.id).subquery()
    )
    result = await db.execute(select(func.count()).select_from(inbox_subquery))
    return result.scalar() or 0


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
