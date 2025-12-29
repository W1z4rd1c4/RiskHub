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
        result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == request_data.resource_id))
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="KRI not found")
        # KRIs are linked to risks, verify access via risk's department
        # Note: KRIs may not have direct department_id, check via linked risk if needed
        resource_name = resource.name[:50] if resource.name else f"KRI-{resource.id}"
    
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
    Approve a pending request and execute the deletion.
    Only Risk Manager, CRO, or Admin can approve.
    Requires mandatory resolution_notes.
    """
    if not can_resolve_approvals(current_user):
        raise HTTPException(status_code=403, detail="Only Risk Manager, CRO, or Admin can approve requests")
    
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval_id)
    )
    approval = result.scalar_one_or_none()
    
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    if approval.status != ApprovalStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Cannot approve request with status: {approval.status.value}")
    
    # Update approval status
    approval.status = ApprovalStatus.APPROVED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = datetime.now(UTC)
    approval.resolution_notes = resolve_data.resolution_notes
    
    # AUTO-EXECUTE based on action type
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
                    for field, vals in changes.items():
                        if hasattr(kri, field):
                            setattr(kri, field, vals.get("new"))
    
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
    - Privileged users: count of all pending requests (to review)
    - Others: count of their own pending requests
    """
    if can_resolve_approvals(current_user):
        # Count all pending for approvers
        result = await db.execute(
            select(func.count()).select_from(ApprovalRequest).where(
                ApprovalRequest.status == ApprovalStatus.PENDING
            )
        )
    else:
        # Count own pending for regular users
        result = await db.execute(
            select(func.count()).select_from(ApprovalRequest).where(
                ApprovalRequest.status == ApprovalStatus.PENDING,
                ApprovalRequest.requested_by_id == current_user.id
            )
        )
    
    count = result.scalar() or 0
    return {"count": count}
