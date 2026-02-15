from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.kri import KRIResponse

router = APIRouter()


@router.get("/{kri_id}", response_model=KRIResponse)
async def get_kri(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    include_archived: bool = Query(False, description="Include archived KRI"),
):
    """Get a single KRI by ID."""
    from app.core.permissions import is_kri_reporting_owner

    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    kri = result.scalar_one_or_none()

    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    # Archived KRIs are hidden unless explicitly requested
    if kri.is_archived and not include_archived:
        raise HTTPException(status_code=404, detail="KRI not found")

    # Allow access if user is reporting owner (cross-department)
    if await is_kri_reporting_owner(db, current_user.id, kri_id):
        return KRIResponse.model_validate(kri)

    # Otherwise verify department access
    check_department_access(kri.risk.department_id, current_user)

    return KRIResponse.model_validate(kri)
