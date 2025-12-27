"""
API endpoints for Key Risk Indicators.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.kri import KRICreate, KRIUpdate, KRIResponse, KRIListResponse
from app.api import deps
from app.core.permissions import get_user_department_ids, check_department_access

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
):
    """List only breached KRIs for dashboard widget."""
    # Apply department filtering via Risk join
    query = select(KeyRiskIndicator).join(Risk)
    
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        query = query.filter(Risk.department_id.in_(dept_ids))
    
    # Apply explicit department filter if provided (and allowed)
    if department_id:
        if dept_ids is not None and department_id not in dept_ids:
             # User trying to access authorized department
             # Just return empty, or could raise 403. Returning empty is safer for filters.
             return []
        query = query.filter(Risk.department_id == department_id)
    
    result = await db.execute(query)
    kris = result.scalars().all()
    
    # Filter to breached only
    items = [KRIResponse.model_validate(k) for k in kris]
    breaches = [i for i in items if i.breach_status != "within"]
    
    return breaches


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
    current_user: User = Depends(deps.get_current_user),
):
    """Create a new KRI. Requires risk_id."""
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
    current_user: User = Depends(deps.get_current_user),
):
    """
    Update a KRI. Non-privileged users editing KRIs linked to critical risks
    will trigger an approval request instead of immediate update.
    """
    from app.core.permissions import can_resolve_approvals, is_critical_risk
    from app.models import ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType
    import json
    
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
    
    # Check if KRI is linked to critical risk (non-privileged users only)
    if not can_resolve_approvals(current_user):
        if kri.risk and is_critical_risk(kri.risk):
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
            name_snippet = kri.name[:50] if kri.name else f"KRI-{kri.id}"
            
            approval = ApprovalRequest(
                resource_type=ApprovalResourceType.KRI,
                resource_id=kri.id,
                resource_name=name_snippet,
                requested_by_id=current_user.id,
                reason=f"Edit to KRI linked to critical risk {kri.risk.risk_id_code}",
                action_type=ApprovalActionType.EDIT,
                pending_changes=json.dumps(pending_changes),
                status=ApprovalStatus.PENDING,
            )
            db.add(approval)
            await db.commit()
            
            raise HTTPException(
                status_code=status.HTTP_202_ACCEPTED,
                detail={"message": "Change requires approval", "approval_id": approval.id}
            )
    
    for field, value in update_data.items():
        setattr(kri, field, value)
    
    await db.commit()
    await db.refresh(kri)
    
    return KRIResponse.model_validate(kri)


@router.delete("/{kri_id}", status_code=202)
async def delete_kri(
    kri_id: int,
    reason: str = Query(..., min_length=1, description="Reason for deletion (mandatory)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
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
    name_snippet = kri.name[:50] if kri.name else f"KRI-{kri.id}"
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
    
    return {"message": "Deletion request submitted for approval", "approval_id": approval.id}
