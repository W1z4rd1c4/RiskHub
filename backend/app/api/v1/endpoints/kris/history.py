from datetime import date
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.kri import (
    KRIHistoryEdit,
    KRIHistoryEntry,
    KRIHistoryListResponse,
    KRIRecordValue,
    KRIResponse,
)
from app.services._kri_history.governance import (
    correct_kri_history_governance,
    list_kri_history_projection,
    record_kri_value_governance,
)

router = APIRouter()
APPROVAL_QUEUED_RESPONSE: dict[int | str, dict[str, Any]] = {202: {"model": ApprovalQueuedResponse}}


@router.post("/{kri_id}/values", response_model=KRIResponse, responses=APPROVAL_QUEUED_RESPONSE)
async def record_kri_value(
    kri_id: int,
    data: KRIRecordValue,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Record a new value for a KRI.

    Access: Users with kri:submit permission, OR the KRI reporting owner.
    - Privileged users (CRO/Risk Manager): apply immediately.
    - Non-privileged users: creates tiered approval (Risk Owner → Privileged if priority).
    """
    return await record_kri_value_governance(
        db=db,
        kri_id=kri_id,
        data=data,
        current_user=current_user,
    )


@router.get("/{kri_id}/history", response_model=KRIHistoryListResponse)
async def get_kri_history(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    include_archived: bool = Query(False, description="Include archived KRI"),
    from_date: Optional[date] = Query(None, description="Filter from date"),
    to_date: Optional[date] = Query(None, description="Filter to date"),
    offset: int = Query(0, ge=0),
    skip: int | None = Query(None, ge=0),
    limit: int = Query(20, ge=1, le=100),
    page: int | None = Query(None, ge=1),
    size: int | None = Query(None, ge=1, le=100),
    sort_by: Literal["recorded_at", "period"] = Query("recorded_at"),
    sort_direction: Literal["desc", "asc"] = Query("desc"),
):
    """Get paginated history for a KRI."""
    return await list_kri_history_projection(
        db=db,
        kri_id=kri_id,
        current_user=current_user,
        include_archived=include_archived,
        from_date=from_date,
        to_date=to_date,
        offset=offset,
        skip=skip,
        limit=limit,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )


@router.patch("/{kri_id}/history/{entry_id}", response_model=KRIHistoryEntry, responses=APPROVAL_QUEUED_RESPONSE)
async def correct_history_entry(
    kri_id: int,
    entry_id: int,
    data: KRIHistoryEdit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """
    Correct a historical KRI value entry.

    Non-privileged users submit an approval request.
    Privileged users apply the correction immediately.
    """
    return await correct_kri_history_governance(
        db=db,
        kri_id=kri_id,
        entry_id=entry_id,
        data=data,
        current_user=current_user,
    )
