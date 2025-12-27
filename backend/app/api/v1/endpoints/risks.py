from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import User, Risk, ControlRiskLink, KeyRiskIndicator
from app.schemas.risk import (
    RiskCreate, RiskUpdate, RiskRead, RiskSummary, RiskListResponse,
    RiskTypeEnum, RiskStatusEnum,
    ControlRiskLinkFromRisk, ControlRiskLinkRead, ControlEffectivenessEnum,
)
from app.api import deps
from app.core.permissions import get_user_department_ids, check_department_access
from app.core.security import require_permission, check_permission

router = APIRouter()


# ============== CRUD Operations ==============

@router.get("", response_model=RiskListResponse)
async def list_risks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[RiskStatusEnum] = None,
    risk_type: Optional[RiskTypeEnum] = None,
    is_priority: Optional[bool] = None,
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived risks in results"),
    has_breach: Optional[bool] = None,
):
    """
    List risks with pagination and filters.
    Department heads without admin/cro/risk_manager role see only their department's risks.
    Returns paginated response with total count.
    """
    base_query = select(Risk)
    
    # Department filtering based on role
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:  # If not empty, user is restricted to specific departments
        base_query = base_query.where(Risk.department_id.in_(dept_ids))
    elif department_id:  # Privileged user can filter by specific department
        base_query = base_query.where(Risk.department_id == department_id)
    
    # Status filter
    if status:
        base_query = base_query.where(Risk.status == status.value)
    elif not include_archived:
        # Default: exclude archived unless explicitly requested
        base_query = base_query.where(Risk.status != RiskStatusEnum.archived.value)
    
    # Risk type filter
    if risk_type:
        base_query = base_query.where(Risk.risk_type == risk_type.value)
    
    # Priority filter
    if is_priority is not None:
        base_query = base_query.where(Risk.is_priority == is_priority)
    
    # Search filter
    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Risk.risk_id_code.ilike(search_pattern),
                Risk.description.ilike(search_pattern),
                Risk.process.ilike(search_pattern),
            )
        )
    # Breach filter
    if has_breach is not None:
        breaching_subq = select(KeyRiskIndicator.risk_id).where(
            or_(
                KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit
            )
        ).scalar_subquery()
        
        if has_breach:
            base_query = base_query.where(Risk.id.in_(breaching_subq))
        else:
            base_query = base_query.where(Risk.id.notin_(breaching_subq))

    # Get total count before pagination
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Apply pagination and ordering
    query = base_query.options(
        selectinload(Risk.department),
        selectinload(Risk.kris)
    ).offset(skip).limit(limit).order_by(Risk.risk_id_code)
    
    result = await db.execute(query)
    risks = result.scalars().all()
    
    # Build items with department_name and KRI summary populated
    items = [
        {
            **{c.name: getattr(r, c.name) for c in Risk.__table__.columns},
            "department_name": r.department.name if r.department else None,
            "gross_probability": r.gross_probability,
            "gross_impact": r.gross_impact,
            "kri_count": len(r.kris),
            "has_breach": any(
                k.current_value < k.lower_limit or k.current_value > k.upper_limit 
                for k in r.kris
            )
        }
        for r in risks
    ]
    
    return RiskListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/{risk_id}", response_model=RiskRead)
async def get_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Get a single risk with all relationships."""
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris),
        )
        .where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Verify department access
    check_department_access(risk.department_id, current_user)
    
    return risk


@router.post("", response_model=RiskRead, status_code=status.HTTP_201_CREATED)
async def create_risk(
    risk_data: RiskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Create a new risk. Requires risks:write permission."""
    # Verify department access
    check_department_access(risk_data.department_id, current_user)
    
    # Auto-generate risk_id_code if not provided
    risk_id_code = risk_data.risk_id_code
    if not risk_id_code:
        # Generate process abbreviation from first 3-4 letters of process
        process_abbr = ''.join(c for c in risk_data.process.upper() if c.isalpha())[:4] or "RISK"
        
        # Find the next available number for this prefix
        pattern = f"{process_abbr}-R%"
        result = await db.execute(
            select(func.count()).select_from(Risk).where(Risk.risk_id_code.like(pattern))
        )
        count = result.scalar() or 0
        risk_id_code = f"{process_abbr}-R{count + 1:02d}"
        
        # Check for uniqueness, increment if collision (handle edge cases)
        for i in range(100):  # Safety limit
            existing = await db.execute(
                select(Risk).where(Risk.risk_id_code == risk_id_code)
            )
            if not existing.scalar_one_or_none():
                break
            risk_id_code = f"{process_abbr}-R{count + 2 + i:02d}"
    
    # Calculate scores
    gross_score = risk_data.gross_probability * risk_data.gross_impact
    net_score = risk_data.net_probability * risk_data.net_impact
    
    risk = Risk(
        risk_id_code=risk_id_code,
        process=risk_data.process,
        subprocess=risk_data.subprocess,
        risk_type=risk_data.risk_type.value,
        category=risk_data.category,
        description=risk_data.description,
        department_id=risk_data.department_id,
        owner_id=risk_data.owner_id,
        gross_probability=risk_data.gross_probability,
        gross_impact=risk_data.gross_impact,
        gross_score=gross_score,
        net_probability=risk_data.net_probability,
        net_impact=risk_data.net_impact,
        net_score=net_score,
        status=risk_data.status.value,
        is_priority=risk_data.is_priority,
    )
    
    db.add(risk)
    await db.commit()
    await db.refresh(risk)
    
    # Reload with relationships
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris),
        )
        .where(Risk.id == risk.id)
    )
    return result.scalar_one()


@router.patch("/{risk_id}", response_model=RiskRead)
async def update_risk(
    risk_id: int,
    risk_data: RiskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Update a risk. Requires risks:write permission OR being the risk owner.
    """
    result = await db.execute(
        select(Risk).where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Verify department access
    check_department_access(risk.department_id, current_user)
    
    # Check permission: either risks:write or is risk owner
    has_write = check_permission(current_user, "risks", "write")
    is_owner = risk.owner_id == current_user.id
    
    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: risks:write or risk owner required"
        )
    
    # Update fields
    update_data = risk_data.model_dump(exclude_unset=True)
    
    # Prevent un-archiving via update
    if risk.status == RiskStatusEnum.archived.value:
        if "status" in update_data and update_data["status"] != RiskStatusEnum.archived.value:
             # Only allow if explicitly intended (could add specific permission check here later)
             # For now, we just proceed but it's good to be aware. 
             # Actually, per plan, let's enforce a rule or at least valid transition.
             raise HTTPException(
                 status_code=status.HTTP_400_BAD_REQUEST,
                 detail="Cannot reactivate archived risk. Please create a new risk or contact administrator."
             )

    for field, value in update_data.items():
        if hasattr(value, 'value'):  # Handle enums
            value = value.value
        setattr(risk, field, value)
    
    # Recalculate scores if probability/impact changed
    risk.gross_score = risk.gross_probability * risk.gross_impact
    risk.net_score = risk.net_probability * risk.net_impact
    
    await db.commit()
    await db.refresh(risk)
    
    # Reload with relationships
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris),
        )
        .where(Risk.id == risk.id)
    )
    return result.scalar_one()


@router.delete("/{risk_id}", status_code=status.HTTP_202_ACCEPTED)
async def delete_risk(
    risk_id: int,
    reason: str = Query(..., min_length=1, description="Reason for deletion (mandatory)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "delete")),
):
    """
    Request deletion of a risk.
    - Risk Manager/CRO/Admin: deletes immediately (204)
    - Others: creates approval request (202), item stays visible
    """
    from app.core.permissions import check_department_access, can_resolve_approvals
    from app.models import ApprovalRequest, ApprovalStatus, ApprovalResourceType
    from fastapi.responses import Response
    
    result = await db.execute(
        select(Risk).where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Verify department access
    check_department_access(risk.department_id, current_user)
    
    # Privileged users can delete immediately
    if can_resolve_approvals(current_user):
        risk.status = RiskStatusEnum.archived.value
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    
    # Check for existing pending request
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.RISK,
            ApprovalRequest.resource_id == risk.id,
            ApprovalRequest.status == ApprovalStatus.PENDING
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending")
    
    # Create approval request - ITEM STAYS VISIBLE
    desc_snippet = risk.description[:50] if risk.description else ""
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=f"{risk.risk_id_code}: {desc_snippet}",
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
    )
    db.add(approval)
    await db.commit()
    
    return {"message": "Deletion request submitted for approval", "approval_id": approval.id}


# ============== Risk-Control Linking Endpoints ==============

@router.get("/{risk_id}/controls", response_model=list[ControlRiskLinkRead])
async def list_risk_controls(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List controls that mitigate this risk."""
    # Verify risk exists
    result = await db.execute(
        select(Risk).where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Verify department access
    check_department_access(risk.department_id, current_user)
    
    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.control),
            selectinload(ControlRiskLink.risk),
        )
        .where(ControlRiskLink.risk_id == risk_id)
    )
    return result.scalars().all()


@router.post("/{risk_id}/controls", response_model=ControlRiskLinkRead, status_code=status.HTTP_201_CREATED)
async def link_risk_to_control(
    risk_id: int,
    link_data: ControlRiskLinkFromRisk,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Link a risk to a control."""
    from app.models import Control
    
    # Verify risk exists
    result = await db.execute(
        select(Risk).where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Verify department access for risk
    check_department_access(risk.department_id, current_user)
    
    # Verify control exists
    result = await db.execute(
        select(Control).where(Control.id == link_data.control_id)
    )
    control = result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Verify department access for control
    check_department_access(control.department_id, current_user)
    
    # Check if link already exists
    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.risk_id == risk_id)
        .where(ControlRiskLink.control_id == link_data.control_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")
    
    link = ControlRiskLink(
        control_id=link_data.control_id,
        risk_id=risk_id,
        effectiveness=link_data.effectiveness.value,
        notes=link_data.notes,
    )
    
    db.add(link)
    await db.commit()
    await db.refresh(link)
    
    # Reload with relationships
    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.control),
            selectinload(ControlRiskLink.risk),
        )
        .where(ControlRiskLink.id == link.id)
    )
    return result.scalar_one()


@router.delete("/{risk_id}/controls/{control_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_risk_from_control(
    risk_id: int,
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Remove link between risk and control."""
    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.risk_id == risk_id)
        .where(ControlRiskLink.control_id == control_id)
    )
    link = result.scalar_one_or_none()
    
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    
    # Verify department access for both sides
    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if risk:
        check_department_access(risk.department_id, current_user)
        
    result = await db.execute(select(Control).where(Control.id == control_id))
    control = result.scalar_one_or_none()
    if control:
        check_department_access(control.department_id, current_user)
    
    await db.delete(link)
    await db.commit()
