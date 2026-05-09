from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.exceptions import NotFoundError
from app.models import KeyRiskIndicator, Risk, User

from .workflow import ensure_can_submit_value


async def _load_kri_with_risk_or_404(
    db: AsyncSession,
    kri_id: int,
    *,
    for_update: bool = False,
) -> KeyRiskIndicator:
    risk_loader = selectinload(KeyRiskIndicator.risk) if for_update else joinedload(KeyRiskIndicator.risk)
    statement = (
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(risk_loader)
    )
    if for_update:
        statement = statement.with_for_update(of=KeyRiskIndicator)
    result = await db.execute(statement)
    kri = result.scalar_one_or_none()
    if not kri:
        raise NotFoundError("KRI not found")
    return kri


async def _assert_kri_submit_access(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    kri_id: int,
    current_user: User,
) -> None:
    await ensure_can_submit_value(db, current_user, kri)
