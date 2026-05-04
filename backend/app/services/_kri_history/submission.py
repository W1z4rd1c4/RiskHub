from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KeyRiskIndicator, User
from app.schemas.kri import KRIRecordValue

from .approval_intake import create_kri_submission_approval


async def _create_kri_submission_approval(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    data: KRIRecordValue,
    current_user: User,
):
    return await create_kri_submission_approval(
        db,
        kri=kri,
        data=data,
        current_user=current_user,
    )
