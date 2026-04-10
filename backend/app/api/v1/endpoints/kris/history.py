from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api import deps
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.kri import (
    KRIHistoryEdit,
    KRIHistoryEntry,
    KRIHistoryListResponse,
    KRIRecordValue,
    KRIResponse,
)

from .history_helpers import (
    _apply_kri_value_directly,
    _assert_kri_submit_access,
    _create_kri_submission_approval,
    _load_kri_with_risk_or_404,
)

router = APIRouter()


@router.post("/{kri_id}/values", response_model=KRIResponse)
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

    kri = await _load_kri_with_risk_or_404(db, kri_id)

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
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    try:
        return await _create_kri_submission_approval(
            db,
            kri=kri,
            data=data,
            current_user=current_user,
        )
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
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """Get paginated history for a KRI."""
    from app.core.permissions import is_kri_reporting_owner
    from app.schemas.kri import KRIHistoryEntry
    from app.services.kri_history_service import KRIHistoryService

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

    # Allow access via ownership (cross-department) per BUSINESS_LOGIC.md §7.1
    has_access = False
    # 1. KRI reporting owner
    if await is_kri_reporting_owner(db, current_user.id, kri_id):
        has_access = True
    # 2. Risk owner (of linked risk)
    elif kri.risk and kri.risk.owner_id == current_user.id:
        has_access = True
    else:
        # 3. Fall back to department access
        try:
            check_department_access(kri.risk.department_id, current_user)
            has_access = True
        except HTTPException:
            pass

    if not has_access:
        raise HTTPException(status_code=403, detail="Access denied")

    entries, total = await KRIHistoryService.get_history(
        db=db,
        kri_id=kri_id,
        from_date=from_date,
        to_date=to_date,
        page=page,
        size=size,
    )

    # Map to response with user names
    items = []
    for entry in entries:
        item = KRIHistoryEntry.model_validate(entry)
        if entry.recorded_by:
            item.recorded_by_name = entry.recorded_by.name
        items.append(item)

    return KRIHistoryListResponse(items=items, total=total, page=page, size=size)


@router.patch("/{kri_id}/history/{entry_id}", response_model=KRIHistoryEntry)
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
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus
    from app.models.kri_history import KRIValueHistory
    from app.schemas.kri import KRIHistoryEntry
    from app.services.kri_history_service import KRIHistoryService

    # Verify KRI exists and access
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
    else:
        # Check for existing pending request (both statuses)
        existing = await db.execute(
            select(ApprovalRequest).where(
                ApprovalRequest.resource_type == ApprovalResourceType.KRI,
                ApprovalRequest.resource_id == kri.id,
                ApprovalRequest.action_type == ApprovalActionType.EDIT,
                ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Edit request already pending for this KRI")

        # Create approval request with history entry info
        # §5.3: KRI corrections ALWAYS require CRO approval (privileged)
        # Tier 1: Risk Owner approves first
        # Tier 2: CRO (privileged) approves second
        primary_approver_id = kri.risk.owner_id if kri.risk else None

        pending_changes = {
            "history_entry_id": entry_id,
            "old_value": entry.value,
            "new_value": data.value,
            "reason": data.reason,
            "period_end": entry.period_end.isoformat(),
        }

        approval = ApprovalRequest(
            resource_type=ApprovalResourceType.KRI,
            resource_id=kri.id,
            resource_name=f"{kri.metric_name[:30]} (history correction)",
            requested_by_id=current_user.id,
            reason=data.reason,
            action_type=ApprovalActionType.EDIT,
            pending_changes=pending_changes,
            status=ApprovalStatus.PENDING,
            primary_approver_id=primary_approver_id,
            requires_privileged_approval=True,  # §5.3: Corrections ALWAYS require CRO
        )

        from app.core.approval_helpers import create_approval_request_with_audit

        await create_approval_request_with_audit(
            db,
            approval=approval,
            actor=current_user,
            department_id=kri.risk.department_id,
            on_duplicate_detail="A correction request is already pending for this KRI.",
        )

        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=202,
            content={
                "message": "History correction requires approval (CRO approval required per §5.3)",
                "approval_id": approval.id,
                "action_type": "edit",
                "primary_approver_id": primary_approver_id,
                "requires_privileged_approval": True,
                "pending_changes": pending_changes,
            },
        )
