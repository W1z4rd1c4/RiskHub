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
    from datetime import UTC, datetime

    from app.core.permissions import can_resolve_approvals, has_permission, is_kri_reporting_owner
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus
    from app.services.kri_history_service import KRIHistoryService
    from app.services.notification_service import NotificationService

    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    kri = result.scalar_one_or_none()

    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    # Block submissions on archived KRIs
    if kri.is_archived:
        raise HTTPException(status_code=409, detail="Cannot submit values for archived KRI")

    # Check if user is reporting owner (cross-department access)
    is_reporting_owner = await is_kri_reporting_owner(db, current_user.id, kri_id)

    # Check permission: kri:submit OR is reporting owner
    # NOTE: kri:submit is independent from risks:write - users with risks:write
    # cannot automatically submit KRI values
    if not (is_reporting_owner or has_permission(current_user, "kri", "submit")):
        raise HTTPException(
            status_code=403,
            detail="Permission denied: requires kri:submit permission or be reporting owner",
        )

    # Verify department access (skipped for reporting owners)
    if not is_reporting_owner:
        check_department_access(kri.risk.department_id, current_user)

    # Privileged users can record directly
    if can_resolve_approvals(current_user):
        # Skip approval, apply immediately (handled below)
        pass
    else:
        # Non-privileged users create a tiered approval request
        today = date.today()
        # FIX: Use latest CLOSED period, not current (possibly future) period
        # This prevents approvals from advancing last_period_end beyond closed periods
        _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, kri.frequency)

        # Non-privileged users cannot specify custom period_end
        if data.period_end and data.period_end != latest_closed_end:
            raise HTTPException(status_code=400, detail="Non-privileged users cannot specify custom period_end")

        # Check for existing pending request for this KRI
        existing = await db.execute(
            select(ApprovalRequest).where(
                ApprovalRequest.resource_type == ApprovalResourceType.KRI,
                ApprovalRequest.resource_id == kri.id,
                ApprovalRequest.action_type == ApprovalActionType.EDIT,
                ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="A value submission request is already pending for this KRI")

        # Determine primary approver: Risk Owner (or fallback to department head logic)
        primary_approver_id = kri.risk.owner_id if kri.risk else None

        # For priority risks, require privileged approval after Risk Owner approves
        requires_privileged = bool(kri.risk and kri.risk.is_priority)

        recorded_at = datetime.now(UTC).isoformat()
        pending_changes = {
            "current_value": {"old": kri.current_value, "new": data.value},
            "period_end": latest_closed_end.isoformat(),
            "recorded_at": recorded_at,
        }

        approval = ApprovalRequest(
            resource_type=ApprovalResourceType.KRI,
            resource_id=kri.id,
            resource_name=f"{kri.metric_name[:30]} (value submission)",
            requested_by_id=current_user.id,
            reason=f"KRI value submission: {data.value}",
            action_type=ApprovalActionType.EDIT,
            pending_changes=pending_changes,
            status=ApprovalStatus.PENDING,
            primary_approver_id=primary_approver_id,
            requires_privileged_approval=requires_privileged,
        )

        from app.core.approval_helpers import create_approval_request_with_audit
        await create_approval_request_with_audit(
            db,
            approval=approval,
            actor=current_user,
            department_id=kri.risk.department_id,
            on_duplicate_detail="A value submission request is already pending for this KRI.",
        )

        # Notify Risk Owner (primary approver)
        if primary_approver_id:
            try:
                from app.models.notification import NotificationType
                await NotificationService.create_notification(
                    db=db,
                    user_id=primary_approver_id,
                    notification_type=NotificationType.APPROVAL_PENDING,
                    title="KRI Value Submission",
                    message=f"KRI '{kri.metric_name}' value submitted for your approval",
                    resource_type="approval",
                    resource_id=approval.id,
                )
                await db.commit()
            except Exception as e:
                await db.rollback()
                import logging
                logging.getLogger(__name__).warning(
                    f"Failed to notify Risk Owner for KRI value submission approval #{approval.id}: {e}"
                )

        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=202,
            content={
                "message": "Value submission requires approval" + (
                    " (priority risk - privileged approval also required)" if requires_privileged else ""
                ),
                "approval_id": approval.id,
                "action_type": "edit",
                "primary_approver_id": primary_approver_id,
                "requires_privileged_approval": requires_privileged,
                "pending_changes": pending_changes,
            }
        )

    # Privileged users can record directly
    try:
        await KRIHistoryService.record_value(
            db=db,
            kri=kri,
            value=data.value,
            recorded_by_id=current_user.id,
            recorded_at=data.recorded_at,
            period_end=data.period_end,
            is_privileged=True,
        )
        await db.commit()
        await db.refresh(kri)

        # Breach Detection
        breach_detected = False
        breach_msg = ""
        if data.value < kri.lower_limit:
            breach_detected = True
            breach_msg = f"Value {data.value} is below lower limit {kri.lower_limit}"
        elif data.value > kri.upper_limit:
            breach_detected = True
            breach_msg = f"Value {data.value} exceeds upper limit {kri.upper_limit}"

        # Send Notifications (Breach)
        if breach_detected:
            from app.models.notification import NotificationType
            from app.services.notification_service import NotificationService

            if kri.reporting_owner_id:
                try:
                    await NotificationService.create_notification(
                        db=db,
                        user_id=kri.reporting_owner_id,
                        notification_type=NotificationType.KRI_BREACH_DETECTED,
                        title="KRI Breach Detected",
                        message=f"KRI '{kri.metric_name}' breached limits! {breach_msg}",
                        resource_type="kri",
                        resource_id=kri.id,
                    )
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Failed to notify KRI reporting owner about breach: {e}")

            # Notify Risk Owner (if different)
            if kri.risk and kri.risk.owner_id and kri.risk.owner_id != kri.reporting_owner_id:
                try:
                    await NotificationService.create_notification(
                        db=db,
                        user_id=kri.risk.owner_id,
                        notification_type=NotificationType.KRI_BREACH_DETECTED,
                        title="Risk KRI Breach",
                        message=f"KRI for your risk '{kri.risk.risk_id_code}' breached limits! {breach_msg}",
                        resource_type="kri",
                        resource_id=kri.id,
                    )
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Failed to notify Risk owner about KRI breach: {e}")

            await db.commit()

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return KRIResponse.model_validate(kri)


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
        select(KRIValueHistory)
        .where(KRIValueHistory.id == entry_id, KRIValueHistory.kri_id == kri_id)
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
                ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
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
                "pending_changes": pending_changes
            }
        )
