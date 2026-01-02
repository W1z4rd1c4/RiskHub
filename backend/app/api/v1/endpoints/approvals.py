"""Approval request endpoints for deletion and edit workflows."""
import datetime
from datetime import datetime, UTC
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import (
    User, Risk, Control, KeyRiskIndicator,
    ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType,
)
from app.models.risk import RiskStatus as RiskStatusEnum
from app.models.control import ControlStatus
from app.schemas.approval_request import (
    ApprovalRequestCreate, ApprovalRequestResolve, ApprovalRequestRead,
    ApprovalRequestListResponse, ApprovalStatusEnum, ApprovalResourceTypeEnum,
    ApprovalActionTypeEnum,
)
from app.api import deps
from app.core.permissions import can_resolve_approvals, check_department_access
from app.services.notification_service import NotificationService
from app.core.activity_logger import log_activity
from app.models.activity_log import ActivityAction, ActivityEntityType

router = APIRouter()


def _build_approval_read(approval: ApprovalRequest) -> dict:
    """Build ApprovalRequestRead dict from model with user names."""
    pending_changes = approval.pending_changes
    
    return {
        "id": approval.id,
        "resource_type": approval.resource_type.value,
        "resource_id": approval.resource_id,
        "resource_name": approval.resource_name,
        "action_type": approval.action_type.value if approval.action_type else "delete",
        "pending_changes": pending_changes,
        "status": approval.status.value,
        "reason": approval.reason,
        "requested_by_id": approval.requested_by_id,
        "requested_by_name": approval.requested_by.name if approval.requested_by else None,
        "requested_by_email": approval.requested_by.email if approval.requested_by else None,
        "resolved_by_id": approval.resolved_by_id,
        "resolved_by_name": approval.resolved_by.name if approval.resolved_by else None,
        "resolved_at": approval.resolved_at,
        "resolution_notes": approval.resolution_notes,
        "created_at": approval.created_at,
    }


@router.post("", response_model=ApprovalRequestRead, status_code=status.HTTP_201_CREATED)
async def create_approval_request(
    request_data: ApprovalRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Create a new approval request for resource deletion.
    Requires mandatory reason.
    """
    # Validate resource exists and get name for snapshot
    resource_name = ""
    if request_data.resource_type == ApprovalResourceTypeEnum.risk:
        result = await db.execute(select(Risk).where(Risk.id == request_data.resource_id))
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="Risk not found")
        # Verify requester has access to resource's department
        check_department_access(resource.department_id, current_user)
        resource_name = f"{resource.risk_id_code}: {resource.description[:50] if resource.description else ''}"
    elif request_data.resource_type == ApprovalResourceTypeEnum.control:
        result = await db.execute(select(Control).where(Control.id == request_data.resource_id))
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="Control not found")
        # Verify requester has access to resource's department
        check_department_access(resource.department_id, current_user)
        resource_name = f"{resource.control_id_code}: {resource.name[:50] if resource.name else ''}"
    elif request_data.resource_type == ApprovalResourceTypeEnum.kri:
        # Load KRI with linked Risk for department access check
        result = await db.execute(
            select(KeyRiskIndicator)
            .options(selectinload(KeyRiskIndicator.risk))
            .where(KeyRiskIndicator.id == request_data.resource_id)
        )
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="KRI not found")
        # Verify access via linked risk's department
        if not resource.risk:
            raise HTTPException(status_code=404, detail="KRI has no linked risk")
        check_department_access(resource.risk.department_id, current_user)
        resource_name = (resource.metric_name or f"KRI-{resource.id}")[:50]
    
    # Check for existing pending request
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType(request_data.resource_type.value),
            ApprovalRequest.resource_id == request_data.resource_id,
            ApprovalRequest.status == ApprovalStatus.PENDING
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending for this resource")
    
    # Create approval request
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType(request_data.resource_type.value),
        resource_id=request_data.resource_id,
        resource_name=resource_name,
        requested_by_id=current_user.id,
        reason=request_data.reason,
        status=ApprovalStatus.PENDING,
    )
    db.add(approval)
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()
    
    # Notify approvers about the new request (within same transaction context)
    try:
        await NotificationService.notify_approvers(db, approval)
        await db.commit()
    except Exception:
        pass  # Notification failure should not fail the approval request
    
    return _build_approval_read(approval)


@router.get("", response_model=ApprovalRequestListResponse)
async def list_approval_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status_filter: Optional[ApprovalStatusEnum] = Query(None, alias="status"),
    resource_type: Optional[ApprovalResourceTypeEnum] = None,
    my_requests: bool = Query(False, description="Show only my submitted requests"),
):
    """
    List approval requests.
    - Privileged users (Risk Manager, CRO, Admin): see all requests
    - Other users: see only their own requests
    """
    base_query = select(ApprovalRequest)
    
    # Permission-based filtering
    if can_resolve_approvals(current_user):
        # Privileged users can see all, but can filter to just their own
        if my_requests:
            base_query = base_query.where(ApprovalRequest.requested_by_id == current_user.id)
    else:
        # Non-privileged users only see their own
        base_query = base_query.where(ApprovalRequest.requested_by_id == current_user.id)
    
    # Apply filters
    if status_filter:
        base_query = base_query.where(ApprovalRequest.status == ApprovalStatus(status_filter.value))
    if resource_type:
        base_query = base_query.where(ApprovalRequest.resource_type == ApprovalResourceType(resource_type.value))
    
    # Count total
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Fetch with pagination
    query = base_query.options(
        selectinload(ApprovalRequest.requested_by),
        selectinload(ApprovalRequest.resolved_by)
    ).offset(skip).limit(limit).order_by(ApprovalRequest.created_at.desc())
    
    result = await db.execute(query)
    approvals = result.scalars().all()
    
    return ApprovalRequestListResponse(
        items=[_build_approval_read(a) for a in approvals],
        total=total,
        skip=skip,
        limit=limit
    )


@router.get("/{approval_id}", response_model=ApprovalRequestRead)
async def get_approval_request(
    approval_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Get a single approval request. Requester or privileged users only."""
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()
    
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    # Permission check: requester or privileged user
    if approval.requested_by_id != current_user.id and not can_resolve_approvals(current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return _build_approval_read(approval)


@router.post("/{approval_id}/approve", response_model=ApprovalRequestRead)
async def approve_request(
    approval_id: int,
    resolve_data: ApprovalRequestResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Approve a pending request and execute the action.
    
    Tiered approval flow:
    - Privileged users (CRO/Admin/Risk Manager): can approve any PENDING or PENDING_PRIVILEGED request.
    - Primary approver (Risk Owner): can approve PENDING requests they own.
      If requires_privileged_approval, moves to PENDING_PRIVILEGED instead of applying.
    """
    result = await db.execute(
        select(ApprovalRequest)
        .options(
            selectinload(ApprovalRequest.requested_by),
            selectinload(ApprovalRequest.resolved_by),
            selectinload(ApprovalRequest.primary_approver),
            selectinload(ApprovalRequest.privileged_approver),
        )
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()
    
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    is_privileged = can_resolve_approvals(current_user)
    is_primary_approver = approval.primary_approver_id == current_user.id
    
    # Check if user can approve this request
    if approval.status == ApprovalStatus.PENDING:
        # PENDING: primary approver or privileged user can approve
        if not is_primary_approver and not is_privileged:
            raise HTTPException(status_code=403, detail="Only the primary approver or a privileged user can approve this request")
    elif approval.status == ApprovalStatus.PENDING_PRIVILEGED:
        # PENDING_PRIVILEGED: only privileged user can approve
        if not is_privileged:
            raise HTTPException(status_code=403, detail="This request requires privileged user approval (CRO/Admin/Risk Manager)")
    else:
        raise HTTPException(status_code=400, detail=f"Cannot approve request with status: {approval.status.value}")
    
    # Determine if we should apply changes or move to next approval stage
    should_apply_changes = False
    
    if approval.status == ApprovalStatus.PENDING:
        if is_privileged:
            # Privileged user bypasses tiered approval
            approval.status = ApprovalStatus.APPROVED
            approval.resolved_by_id = current_user.id
            approval.resolved_at = datetime.now(UTC)
            approval.resolution_notes = resolve_data.resolution_notes
            should_apply_changes = True
        elif is_primary_approver:
            # Primary approver approving
            approval.primary_approved_at = datetime.now(UTC)
            if approval.requires_privileged_approval:
                # Move to PENDING_PRIVILEGED
                approval.status = ApprovalStatus.PENDING_PRIVILEGED
                approval.resolution_notes = f"Primary approval by Risk Owner: {resolve_data.resolution_notes}"
            else:
                # No privileged approval needed, finalize
                approval.status = ApprovalStatus.APPROVED
                approval.resolved_by_id = current_user.id
                approval.resolved_at = datetime.now(UTC)
                approval.resolution_notes = resolve_data.resolution_notes
                should_apply_changes = True
    elif approval.status == ApprovalStatus.PENDING_PRIVILEGED:
        # Privileged user finalizing
        approval.status = ApprovalStatus.APPROVED
        approval.privileged_approver_id = current_user.id
        approval.privileged_approved_at = datetime.now(UTC)
        approval.resolved_by_id = current_user.id
        approval.resolved_at = datetime.now(UTC)
        approval.resolution_notes = (approval.resolution_notes or "") + f"\nPrivileged approval: {resolve_data.resolution_notes}"
        should_apply_changes = True
    
    # AUTO-EXECUTE based on action type (only if should apply changes)
    if should_apply_changes:
        if approval.action_type == ApprovalActionType.DELETE:
            # DELETE: Archive/delete the resource
            if approval.resource_type == ApprovalResourceType.RISK:
                risk_result = await db.execute(select(Risk).where(Risk.id == approval.resource_id))
                risk = risk_result.scalar_one_or_none()
                if risk:
                    risk.status = RiskStatusEnum.archived.value
            elif approval.resource_type == ApprovalResourceType.CONTROL:
                control_result = await db.execute(select(Control).where(Control.id == approval.resource_id))
                control = control_result.scalar_one_or_none()
                if control:
                    control.status = ControlStatus.archived.value
            elif approval.resource_type == ApprovalResourceType.KRI:
                kri_result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == approval.resource_id))
                kri = kri_result.scalar_one_or_none()
                if kri:
                    await db.delete(kri)
        
        elif approval.action_type == ApprovalActionType.EDIT:
            # EDIT: Apply pending changes to the resource
            if approval.pending_changes:
                changes = approval.pending_changes
                if approval.resource_type == ApprovalResourceType.RISK:
                    risk_result = await db.execute(select(Risk).where(Risk.id == approval.resource_id))
                    risk = risk_result.scalar_one_or_none()
                    if risk:
                        for field, vals in changes.items():
                            if hasattr(risk, field):
                                setattr(risk, field, vals.get("new"))
                elif approval.resource_type == ApprovalResourceType.CONTROL:
                    control_result = await db.execute(select(Control).where(Control.id == approval.resource_id))
                    control = control_result.scalar_one_or_none()
                    if control:
                        for field, vals in changes.items():
                            if hasattr(control, field):
                                setattr(control, field, vals.get("new"))
                elif approval.resource_type == ApprovalResourceType.KRI:
                    kri_result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == approval.resource_id))
                    kri = kri_result.scalar_one_or_none()
                    if kri:
                        if "history_entry_id" in changes:
                            from app.services.kri_history_service import KRIHistoryService
                            entry_id = changes.get("history_entry_id")
                            new_value = changes.get("new_value")
                            if entry_id is None or new_value is None:
                                raise HTTPException(status_code=400, detail="Invalid KRI history correction payload")
                            try:
                                await KRIHistoryService.apply_history_correction(
                                    db=db,
                                    entry_id=entry_id,
                                    new_value=new_value,
                                    corrected_by_id=current_user.id,
                                )
                            except ValueError as e:
                                raise HTTPException(status_code=400, detail=str(e))
                        elif "period_end" in changes and "current_value" in changes:
                            # Handle value submission approval with period_end
                            from datetime import date as date_type
                            from app.services.kri_history_service import KRIHistoryService
                            
                            value_change = changes.get("current_value")
                            period_end_str = changes.get("period_end")
                            recorded_at_str = changes.get("recorded_at")
                            
                            if value_change is None or period_end_str is None:
                                raise HTTPException(status_code=400, detail="Invalid KRI value submission payload")
                            
                            # Parse period_end and recorded_at
                            period_end = date_type.fromisoformat(period_end_str)
                            recorded_at = datetime.fromisoformat(recorded_at_str) if recorded_at_str else None
                            
                            try:
                                await KRIHistoryService.record_value(
                                    db=db,
                                    kri=kri,
                                    value=value_change.get("new"),
                                    recorded_by_id=current_user.id,
                                    recorded_at=recorded_at,
                                    period_end=period_end,
                                    is_privileged=True,
                                    allow_open_period=True,  # Allow open period for approved submissions
                                )
                            except ValueError as e:
                                raise HTTPException(status_code=400, detail=str(e))
                        else:
                            value_change = changes.get("current_value")
                            for field, vals in changes.items():
                                if field == "current_value":
                                    continue
                                if hasattr(kri, field):
                                    setattr(kri, field, vals.get("new"))
                            if value_change is not None:
                                from app.services.kri_history_service import KRIHistoryService
                                try:
                                    await KRIHistoryService.record_value(
                                        db=db,
                                        kri=kri,
                                        value=value_change.get("new"),
                                        recorded_by_id=current_user.id,
                                        is_privileged=True,
                                    )
                                except ValueError as e:
                                    raise HTTPException(status_code=400, detail=str(e))
    else:
        # PENDING_PRIVILEGED: Notify privileged users
        try:
            await NotificationService.notify_approvers(db, approval)
        except Exception:
            pass
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()
    
    # Notify requester about approval
    try:
        await NotificationService.notify_requester_resolved(db, approval, approved=True)
        await db.commit()
    except Exception:
        pass  # Notification failure should not fail the approval
    
    return _build_approval_read(approval)


@router.post("/{approval_id}/reject", response_model=ApprovalRequestRead)
async def reject_request(
    approval_id: int,
    resolve_data: ApprovalRequestResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Reject a pending request.
    Only Risk Manager, CRO, or Admin can reject.
    Requires mandatory resolution_notes.
    """
    if not can_resolve_approvals(current_user):
        raise HTTPException(status_code=403, detail="Only Risk Manager, CRO, or Admin can reject requests")
    
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()
    
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Cannot reject request with status: {approval.status.value}")
    
    # Update approval status
    approval.status = ApprovalStatus.REJECTED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = datetime.now(UTC)
    approval.resolution_notes = resolve_data.resolution_notes
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()
    
    # Notify requester about rejection
    try:
        await NotificationService.notify_requester_resolved(db, approval, approved=False)
        await db.commit()
    except Exception:
        pass  # Notification failure should not fail the rejection
    
    return _build_approval_read(approval)


@router.post("/{approval_id}/cancel", response_model=ApprovalRequestRead)
async def cancel_request(
    approval_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Cancel own pending request.
    Only the original requester can cancel.
    """
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()
    
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    if approval.requested_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the requester can cancel their request")
    
    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Cannot cancel request with status: {approval.status.value}")
    
    # Update status
    approval.status = ApprovalStatus.CANCELLED
    approval.resolved_at = datetime.now(UTC)
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()
    
    return _build_approval_read(approval)


@router.get("/pending/count")
async def get_pending_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Get count of pending approvals for badge display.
    - Privileged users: count of all pending requests (PENDING + PENDING_PRIVILEGED)
    - Primary approvers (Risk Owners): count of requests they need to approve
    - Others: count of their own pending requests
    """
    if can_resolve_approvals(current_user):
        # Count all pending/pending_privileged for approvers
        result = await db.execute(
            select(func.count()).select_from(ApprovalRequest).where(
                ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
            )
        )
    else:
        # Count own pending + requests where user is primary approver
        result = await db.execute(
            select(func.count()).select_from(ApprovalRequest).where(
                or_(
                    # Own pending requests
                    (ApprovalRequest.status == ApprovalStatus.PENDING) & 
                    (ApprovalRequest.requested_by_id == current_user.id),
                    # Requests where user is primary approver
                    (ApprovalRequest.status == ApprovalStatus.PENDING) &
                    (ApprovalRequest.primary_approver_id == current_user.id)
                )
            )
        )
    
    count = result.scalar() or 0
    return {"count": count}


@router.get("/my-approvals", response_model=ApprovalRequestListResponse)
async def list_my_approval_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """
    List approval requests where current user is the primary approver (Risk Owner).
    Returns all PENDING requests that need this user's approval.
    """
    base_query = select(ApprovalRequest).where(
        ApprovalRequest.primary_approver_id == current_user.id,
        ApprovalRequest.status == ApprovalStatus.PENDING
    )
    
    # Count total
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Fetch with pagination
    query = base_query.options(
        selectinload(ApprovalRequest.requested_by),
        selectinload(ApprovalRequest.resolved_by)
    ).offset(skip).limit(limit).order_by(ApprovalRequest.created_at.desc())
    
    result = await db.execute(query)
    approvals = result.scalars().all()
    
    return ApprovalRequestListResponse(
        items=[_build_approval_read(a) for a in approvals],
        total=total,
        skip=skip,
        limit=limit
    )
