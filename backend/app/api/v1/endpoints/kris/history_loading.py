from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import KeyRiskIndicator, Risk, User
from app.services._kri_history.workflow import ensure_can_submit_value


async def _load_kri_with_risk_or_404(
    db: AsyncSession,
    kri_id: int,
    *,
    for_update: bool = False,
) -> KeyRiskIndicator:
    statement = (
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    if for_update:
        statement = statement.with_for_update()
    result = await db.execute(statement)
    kri = result.scalar_one_or_none()
    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")
    return kri


async def _assert_kri_submit_access(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    kri_id: int,
    current_user: User,
) -> None:
    await ensure_can_submit_value(db, current_user, kri)
