from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.risk_questionnaire import RiskQuestionnaireListItemRead
from app.services.risk_questionnaire_service import list_questionnaire_inbox

from ._shared import _serialize_list_item_for_user

router = APIRouter()


@router.get("/inbox", response_model=list[RiskQuestionnaireListItemRead])
async def get_questionnaire_inbox(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
) -> list[RiskQuestionnaireListItemRead]:
    items = await list_questionnaire_inbox(db, current_user)
    return [await _serialize_list_item_for_user(db, current_user, q) for q in items]
