"""
API endpoints for Key Risk Indicators.
"""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.kri import (
    KRICreate, KRIUpdate, KRIResponse, KRIListResponse,
    KRIRecordValue, KRIHistoryEntry, KRIHistoryListResponse, KRIHistoryEdit,
)
from app.api import deps
from app.core.permissions import get_user_department_ids, check_department_access
from app.core.security import require_permission

router = APIRouter(prefix="/kris", tags=["Key Risk Indicators"])


@router.get("", response_model=KRIListResponse)
async def list_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    risk_id: Optional[int] = Query(None, description="Filter by risk ID"),
    breach_only: bool = Query(False, description="Only return breached KRIs"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=1000),
):
    """List all KRIs with optional filters."""
    # Apply department filtering via Risk join
    query = select(KeyRiskIndicator).join(Risk)
    
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        query = query.filter(Risk.department_id.in_(dept_ids))
    
    if risk_id:
        query = query.where(KeyRiskIndicator.risk_id == risk_id)
    
    # Apply breach filter BEFORE count and pagination
    if breach_only:
        query = query.where(
            or_(
                KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit
            )
        )
    
    # Count total after all filters are applied
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Eagerly load risk and department for grouping metadata
    query = query.options(
        joinedload(KeyRiskIndicator.risk).joinedload(Risk.department)
    )
    
    # Paginate
    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    kris = result.scalars().all()
    
    # Map to response with metadata
    items = []
    for k in kris:
        res = KRIResponse.model_validate(k)
        if k.risk:
            res.risk_category = k.risk.category
            res.risk_process = k.risk.process
            res.risk_description = k.risk.description
            if k.risk.department:
                res.department_name = k.risk.department.name
        items.append(res)
    
    return KRIListResponse(items=items, total=total, page=page, size=size)


@router.get("/breaches", response_model=list[KRIResponse])
async def list_breaches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    department_id: Optional[int] = Query(None, description="Filter by department ID"),
    include_archived: bool = Query(False, description="Include KRIs linked to archived risks"),
):
    """List only breached KRIs for dashboard widget. Excludes archived risks by default."""
    from app.models.risk import RiskStatus
    
    # Apply department filtering via Risk join
    query = select(KeyRiskIndicator).join(Risk)
    
    # Exclude archived risks by default
    if not include_archived:
        query = query.where(Risk.status != RiskStatus.archived.value)
    
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        query = query.filter(Risk.department_id.in_(dept_ids))
    
    # Apply explicit department filter if provided (and allowed)
    if department_id:
        if dept_ids is not None and department_id not in dept_ids:
             # User trying to access unauthorized department
             # Just return empty, or could raise 403. Returning empty is safer for filters.
             return []
        query = query.filter(Risk.department_id == department_id)
    
    result = await db.execute(query)
    kris = result.scalars().all()
    
    # Filter to breached only
    items = [KRIResponse.model_validate(k) for k in kris]
    breaches = [i for i in items if i.breach_status != "within"]
    
    return breaches



@router.get("/overdue", response_model=list[dict])
async def list_overdue_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    List all KRIs that are overdue for reporting.
    
    Returns KRIs with due_date, days_overdue, and reporting_owner info.
    """
    from app.services.kri_history_service import KRIHistoryService
    
    overdue = await KRIHistoryService.get_overdue_kris(db)
    
    # Filter by department access
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        # Need to check each KRI's risk department
        filtered = []
        for item in overdue:
            risk_result = await db.execute(
                select(Risk).where(Risk.id == item["risk_id"])
            )
            risk = risk_result.scalar_one_or_none()
            if risk and risk.department_id in dept_ids:
                filtered.append(item)
        return filtered
    
    return overdue


@router.get("/due-soon", response_model=list[dict])
async def list_due_soon_kris(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    List all KRIs that are due soon (within 7 days before period end).
    
    Returns KRIs with due_date, days_until_due, and reporting_owner info.
    Useful for CRO dashboard to see upcoming deadlines.
    """
    from app.services.kri_history_service import KRIHistoryService
    
    due_soon = await KRIHistoryService.get_due_soon_kris(db)
    
    # Filter by department access
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        # Need to check each KRI's risk department
        filtered = []
        for item in due_soon:
            risk_result = await db.execute(
                select(Risk).where(Risk.id == item["risk_id"])
            )
            risk = risk_result.scalar_one_or_none()
            if risk and risk.department_id in dept_ids:
                filtered.append(item)
        return filtered
    
    return due_soon


@router.get("/{kri_id}", response_model=KRIResponse)
async def get_kri(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Get a single KRI by ID."""
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    kri = result.scalar_one_or_none()
    
    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")
    
    # Verify department access
    check_department_access(kri.risk.department_id, current_user)
    
    return KRIResponse.model_validate(kri)


@router.post("", response_model=KRIResponse, status_code=201)
async def create_kri(
    data: KRICreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Create a new KRI. Requires risks:write permission."""
    # Verify risk exists
    risk_result = await db.execute(
        select(Risk).where(Risk.id == data.risk_id)
    )
    risk = risk_result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Verify department access
    check_department_access(risk.department_id, current_user)
    
    # Validate limits
    if data.lower_limit >= data.upper_limit:
        raise HTTPException(
            status_code=400, 
            detail="lower_limit must be less than upper_limit"
        )
    
    kri = KeyRiskIndicator(**data.model_dump())
    db.add(kri)
    await db.commit()
    await db.refresh(kri)
    
    return KRIResponse.model_validate(kri)


@router.put("/{kri_id}", response_model=KRIResponse)
async def update_kri(
    kri_id: int,
    data: KRIUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """
    Update a KRI. Non-privileged users editing any KRI
    will trigger an approval request instead of immediate update.
    """
    from app.core.permissions import can_resolve_approvals
    from app.models import ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType
    
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    kri = result.scalar_one_or_none()
    
    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")
    
    # Verify department access
    check_department_access(kri.risk.department_id, current_user)
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Validate limits if both provided
    new_lower = update_data.get("lower_limit", kri.lower_limit)
    new_upper = update_data.get("upper_limit", kri.upper_limit)
    if new_lower >= new_upper:
        raise HTTPException(
            status_code=400, 
            detail="lower_limit must be less than upper_limit"
        )
    
    # Check for pending DELETE request (block any updates if delete is pending)
    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status == ApprovalStatus.PENDING
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cannot update KRI while deletion is pending approval")
    
    # ALL KRI edits by non-privileged users require approval
    if not can_resolve_approvals(current_user):
        # Check for existing pending edit request
        existing = await db.execute(
            select(ApprovalRequest).where(
                ApprovalRequest.resource_type == ApprovalResourceType.KRI,
                ApprovalRequest.resource_id == kri.id,
                ApprovalRequest.action_type == ApprovalActionType.EDIT,
                ApprovalRequest.status == ApprovalStatus.PENDING
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Edit request already pending for this KRI")
        
        pending_changes = {k: {"old": getattr(kri, k, None), "new": v} for k, v in update_data.items()}
        name_snippet = kri.metric_name[:50] if kri.metric_name else f"KRI-{kri.id}"
        
        approval = ApprovalRequest(
            resource_type=ApprovalResourceType.KRI,
            resource_id=kri.id,
            resource_name=name_snippet,
            requested_by_id=current_user.id,
            reason=f"Edit to KRI '{name_snippet}' requires approval",
            action_type=ApprovalActionType.EDIT,
            pending_changes=pending_changes,
            status=ApprovalStatus.PENDING,
        )
        db.add(approval)
        await db.commit()
        
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=202,
            content={
                "message": "Change requires approval",
                "approval_id": approval.id,
                "action_type": "edit",
                "pending_fields": list(pending_changes.keys()),
                "pending_changes": pending_changes
            }
        )

    
    value_update = update_data.pop("current_value", None)
    
    for field, value in update_data.items():
        setattr(kri, field, value)
    
    if value_update is not None:
        from app.services.kri_history_service import KRIHistoryService
        try:
            await KRIHistoryService.record_value(
                db=db,
                kri=kri,
                value=value_update,
                recorded_by_id=current_user.id,
                is_privileged=can_resolve_approvals(current_user),
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    await db.commit()
    await db.refresh(kri)
    
    return KRIResponse.model_validate(kri)


@router.delete("/{kri_id}", status_code=202)
async def delete_kri(
    kri_id: int,
    reason: str = Query(..., min_length=1, description="Reason for deletion (mandatory)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "delete")),
):
    """
    Request deletion of a KRI.
    - Risk Manager/CRO/Admin: deletes immediately (204)
    - Others: creates approval request (202), item stays visible
    """
    from app.core.permissions import can_resolve_approvals
    from app.models import ApprovalRequest, ApprovalStatus, ApprovalResourceType
    from fastapi.responses import Response
    
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    kri = result.scalar_one_or_none()
    
    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")
    
    # Verify department access via linked risk
    check_department_access(kri.risk.department_id, current_user)
    
    # Privileged users can delete immediately
    if can_resolve_approvals(current_user):
        await db.delete(kri)
        await db.commit()
        return Response(status_code=204)
    
    # Check for existing pending request
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.status == ApprovalStatus.PENDING
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending")
    
    # Create approval request - ITEM STAYS VISIBLE
    name_snippet = kri.metric_name[:50] if kri.metric_name else f"KRI-{kri.id}"
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        resource_name=name_snippet,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
    )
    db.add(approval)
    await db.commit()
    
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=202,
        content={
            "message": "Deletion request submitted for approval",
            "approval_id": approval.id,
            "action_type": "delete"
        }
    )


# ============ HISTORY ENDPOINTS ============

@router.post("/{kri_id}/values", response_model=KRIResponse)
async def record_kri_value(
    kri_id: int,
    data: KRIRecordValue,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """
    Record a new value for a KRI.
    
    Creates a history entry and updates the current value.
    Non-privileged users can only record for the current period within the grace window.
    Privileged users can backdate by specifying period_end.
    """
    from app.core.permissions import can_resolve_approvals
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
    
    # Verify department access
    check_department_access(kri.risk.department_id, current_user)
    
    try:
        history_entry = await KRIHistoryService.record_value(
            db=db,
            kri=kri,
            value=data.value,
            recorded_by_id=current_user.id,
            recorded_at=data.recorded_at,
            period_end=data.period_end,
            is_privileged=can_resolve_approvals(current_user),
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
            
            # Notify KRI Owner
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
                    pass
            
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
                    pass
            
            await db.commit()
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    return KRIResponse.model_validate(kri)


@router.get("/{kri_id}/history", response_model=KRIHistoryListResponse)
async def get_kri_history(
    kri_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    from_date: Optional[date] = Query(None, description="Filter from date"),
    to_date: Optional[date] = Query(None, description="Filter to date"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """Get paginated history for a KRI."""
    from datetime import date
    from app.services.kri_history_service import KRIHistoryService
    from app.schemas.kri import KRIHistoryEntry
    
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk))
    )
    kri = result.scalar_one_or_none()
    
    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")
    
    # Verify department access
    check_department_access(kri.risk.department_id, current_user)
    
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
    from app.services.kri_history_service import KRIHistoryService
    from app.models import ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType
    from app.models.kri_history import KRIValueHistory
    from app.schemas.kri import KRIHistoryEntry
    
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
            raise HTTPException(status_code=400, detail=str(e))
    else:
        # Check for existing pending request
        existing = await db.execute(
            select(ApprovalRequest).where(
                ApprovalRequest.resource_type == ApprovalResourceType.KRI,
                ApprovalRequest.resource_id == kri.id,
                ApprovalRequest.action_type == ApprovalActionType.EDIT,
                ApprovalRequest.status == ApprovalStatus.PENDING
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Edit request already pending for this KRI")
        
        # Create approval request with history entry info
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
        )
        db.add(approval)
        await db.commit()
        
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=202,
            content={
                "message": "History correction requires approval",
                "approval_id": approval.id,
                "action_type": "edit",
                "pending_changes": pending_changes
            }
        )
