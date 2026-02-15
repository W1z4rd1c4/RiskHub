from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.kri import KRIResponse

router = APIRouter()


@router.post("/{kri_id}/restore", response_model=KRIResponse)
async def restore_kri(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "delete")),
):
    """Restore an archived KRI."""
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    kri = result.scalar_one_or_none()

    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    check_department_access(kri.risk.department_id, current_user)

    if not kri.is_archived:
        raise HTTPException(status_code=400, detail="KRI is not archived")

    changes = build_change_set(
        kri,
        {"is_archived": False, "archived_at": None, "archived_by_id": None},
    )
    kri.is_archived = False
    kri.archived_at = None
    kri.archived_by_id = None

    await log_activity(
        db,
        entity_type=ActivityEntityType.KRI,
        entity_id=kri.id,
        entity_name=f"{kri.metric_name}",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=kri.risk.department_id,
        changes=changes,
        description=f"Restored KRI {kri.metric_name}",
    )
    await db.commit()
    await db.refresh(kri)

    return KRIResponse.model_validate(kri)

