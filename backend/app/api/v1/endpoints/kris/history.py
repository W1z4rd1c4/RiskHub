from datetime import date
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
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
from app.services._kri_history.recording import DuplicateKRIPeriodError
from app.services._kri_history.workflow import (
    ensure_can_read_history,
    ensure_can_request_history_correction,
)

from .history_corrections import create_kri_history_correction_approval
from .history_helpers import (
    _apply_kri_value_directly,
    _assert_kri_submit_access,
    _create_kri_submission_approval,
    _load_kri_with_risk_or_404,
)
from .history_listing import build_kri_history_response

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
    from app.core.permissions import can_resolve_approvals

    kri = await _load_kri_with_risk_or_404(db, kri_id, for_update=True)

    # Block submissions on archived KRIs
    if kri.is_archived:
        raise HTTPException(status_code=409, detail="Cannot submit values for archived KRI")
    await _assert_kri_submit_access(db, kri=kri, kri_id=kri_id, current_user=current_user)

    # Privileged users can record directly
    if can_resolve_approvals(current_user):
        try:
            return await _apply_kri_value_directly(
                db,
                kri=kri,
                data=data,
                current_user=current_user,
            )
        except DuplicateKRIPeriodError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    try:
        return await _create_kri_submission_approval(
            db,
            kri=kri,
            data=data,
            current_user=current_user,
        )
    except DuplicateKRIPeriodError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


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
    kri = await _load_kri_with_risk_or_404(db, kri_id)

    # Archived KRIs are hidden unless explicitly requested
    if kri.is_archived and not include_archived:
        raise HTTPException(status_code=404, detail="KRI not found")

    await ensure_can_read_history(db, current_user, kri)

    effective_limit = size if size is not None else limit
    effective_offset = skip if skip is not None else offset
    if page is not None:
        effective_offset = (page - 1) * effective_limit

    return await build_kri_history_response(
        db=db,
        kri=kri,
        kri_id=kri_id,
        current_user=current_user,
        from_date=from_date,
        to_date=to_date,
        offset=effective_offset,
        limit=effective_limit,
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
    from app.core.permissions import can_resolve_approvals
    from app.models.kri_history import KRIValueHistory
    from app.schemas.kri import KRIHistoryEntry
    from app.services.kri_history_service import KRIHistoryService

    # Verify KRI exists and access
    kri = await _load_kri_with_risk_or_404(db, kri_id, for_update=True)
    await ensure_can_request_history_correction(db, current_user, kri)

    # Verify history entry exists and belongs to this KRI
    entry_result = await db.execute(
        select(KRIValueHistory).where(KRIValueHistory.id == entry_id, KRIValueHistory.kri_id == kri_id)
    )
    entry = entry_result.scalar_one_or_none()

    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")

    if can_resolve_approvals(current_user):
        # Apply correction immediately
        try:
            updated_entry = await KRIHistoryService.apply_history_correction(
                db=db,
                entry_id=entry_id,
                new_value=data.value,
                corrected_by_id=current_user.id,
            )
            await db.commit()
            await db.refresh(updated_entry)
            return KRIHistoryEntry.model_validate(updated_entry)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    return await create_kri_history_correction_approval(
        db,
        kri=kri,
        entry=entry,
        entry_id=entry_id,
        data=data,
        current_user=current_user,
    )
