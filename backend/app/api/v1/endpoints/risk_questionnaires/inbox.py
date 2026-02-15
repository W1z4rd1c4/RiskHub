from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.db.session import get_db
from app.models import Risk, RiskQuestionnaire, User
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.models.role import RoleType
from app.schemas.risk_questionnaire import RiskQuestionnaireListItemRead

from ._shared import _serialize_list_item

router = APIRouter()


@router.get("/inbox", response_model=list[RiskQuestionnaireListItemRead])
async def get_questionnaire_inbox(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> list[RiskQuestionnaireListItemRead]:
    open_statuses = {RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress}

    owner_clause = RiskQuestionnaire.assigned_to_user_id == current_user.id

    dept_clause = None
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    if role_name == RoleType.DEPARTMENT_HEAD and current_user.department_id is not None:
        dept_clause = Risk.department_id == current_user.department_id

    query = (
        select(RiskQuestionnaire)
        .join(Risk, Risk.id == RiskQuestionnaire.risk_id)
        .options(
            selectinload(RiskQuestionnaire.risk),
            selectinload(RiskQuestionnaire.assigned_to_user),
            selectinload(RiskQuestionnaire.sent_by_user),
            selectinload(RiskQuestionnaire.submitted_by_user),
        )
        .where(RiskQuestionnaire.status.in_(open_statuses))
    )

    if dept_clause is not None:
        query = query.where(or_(owner_clause, dept_clause))
    else:
        query = query.where(owner_clause)

    # Ensure dept scoping for non-privileged users (owners are already scoped by assignment).
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        if not dept_ids:
            return []
        query = query.where(or_(owner_clause, Risk.department_id.in_(dept_ids)))

    result = await db.execute(query.order_by(desc(RiskQuestionnaire.due_at)))
    items = result.scalars().all()
    return [_serialize_list_item(q) for q in items]
