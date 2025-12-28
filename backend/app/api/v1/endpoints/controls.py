from typing import Optional
from datetime import datetime, timedelta, UTC
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import User, Control, ControlExecution, ControlRiskLink
from app.schemas.control import (
    ControlCreate, ControlUpdate, ControlRead, ControlSummary, ControlListResponse,
    ControlExecutionCreate, ControlExecutionRead,
    ControlFormEnum, ControlFrequencyEnum, ControlStatusEnum,
)
from app.schemas.risk import ControlRiskLinkCreate, ControlRiskLinkRead
from app.api import deps
from app.core.permissions import get_user_department_ids, check_department_access
from app.core.security import require_permission, check_permission

router = APIRouter()


# ============== CRUD Operations ==============

@router.get("", response_model=ControlListResponse)
async def list_controls(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[ControlStatusEnum] = None,
    search: Optional[str] = None,
):
    """
    List controls with pagination and filters.
    Department heads without admin/cro/risk_manager role see only their department's controls.
    Returns paginated response with total count.
    """
    base_query = select(Control)
    
    # Department filtering based on role
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:  # If not empty, user is restricted to specific departments
        base_query = base_query.where(Control.department_id.in_(dept_ids))
    elif department_id:  # Privileged user can filter by specific department
        base_query = base_query.where(Control.department_id == department_id)
    
    # Status filter
    if status:
        base_query = base_query.where(Control.status == status.value)
    else:
        # Default: exclude archived
        base_query = base_query.where(Control.status != ControlStatusEnum.archived.value)
    
    # Search filter
    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Control.name.ilike(search_pattern),
                Control.description.ilike(search_pattern),
            )
        )
    
    # Get total count before pagination
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Apply pagination and ordering with eager loading
    query = base_query.options(selectinload(Control.department)).offset(skip).limit(limit).order_by(Control.name)
    
    result = await db.execute(query)
    controls = result.scalars().all()
    
    # Map to summary with department_name
    items = [
        ControlSummary(
            id=c.id,
            name=c.name,
            department_id=c.department_id,
            department_name=c.department.name if c.department else None,
            frequency=ControlFrequencyEnum(c.frequency),
            risk_level=c.risk_level,
            status=ControlStatusEnum(c.status),
            control_form=ControlFormEnum(c.control_form),
        )
        for c in controls
    ]
    
    return ControlListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/{control_id}", response_model=ControlRead)
async def get_control(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Get a single control with all relationships."""
    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
        )
        .where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Verify department access
    check_department_access(control.department_id, current_user)
    
    return control


@router.post("", response_model=ControlRead, status_code=status.HTTP_201_CREATED)
async def create_control(
    control_data: ControlCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "write")),
):
    """Create a new control. Requires controls:write permission."""
    # Verify department access
    check_department_access(control_data.department_id, current_user)
    
    control = Control(
        name=control_data.name,
        description=control_data.description,
        data_source=control_data.data_source,
        methodology_reference=control_data.methodology_reference,
        control_form=control_data.control_form.value,
        process_owner_position=control_data.process_owner_position,
        control_owner_id=control_data.control_owner_id,
        executor_position=control_data.executor_position,
        frequency=control_data.frequency.value,
        risk_level=control_data.risk_level,
        output_description=control_data.output_description,
        report_recipient=control_data.report_recipient,
        documentation_location=control_data.documentation_location,
        department_id=control_data.department_id,
        status=control_data.status.value,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    
    db.add(control)
    await db.commit()
    await db.refresh(control)
    
    # Reload with relationships
    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
        )
        .where(Control.id == control.id)
    )
    return result.scalar_one()


@router.patch("/{control_id}", response_model=ControlRead)
async def update_control(
    control_id: int,
    control_data: ControlUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Update a control. Requires controls:write permission OR being the control owner.
    Non-privileged users editing controls linked to critical risks or changing
    sensitive fields (owner, department) will trigger an approval request.
    """
    from app.core.permissions import can_resolve_approvals, is_critical_risk, has_sensitive_field_changes
    from app.models import ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType, ControlRiskLink
    import json
    
    result = await db.execute(
        select(Control).where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Verify department access
    check_department_access(control.department_id, current_user)
    
    # Check permission: either controls:write or is control owner
    has_write = check_permission(current_user, "controls", "write")
    is_owner = control.control_owner_id == current_user.id
    
    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: controls:write or control owner required"
        )
    
    # Update fields
    update_data = control_data.model_dump(exclude_unset=True)
    
    # Check for pending DELETE request (block any updates if delete is pending)
    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            ApprovalRequest.resource_id == control.id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status == ApprovalStatus.PENDING
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cannot update control while deletion is pending approval")
    
    # Check for approval requirements (non-privileged users only)
    if not can_resolve_approvals(current_user):
        requires_approval = False
        approval_reason = ""
        pending_changes = {}
        
        # Check 1: Is control linked to critical risk?
        linked_risks_result = await db.execute(
            select(Risk).join(ControlRiskLink).where(ControlRiskLink.control_id == control.id)
        )
        for risk in linked_risks_result.scalars():
            if is_critical_risk(risk):
                requires_approval = True
                approval_reason = f"Edit to control linked to critical risk {risk.risk_id_code}"
                pending_changes = {k: {"old": getattr(control, k, None), "new": v.value if hasattr(v, 'value') else v} 
                                   for k, v in update_data.items()}
                break
        
        # Check 2: Sensitive field changes (even if not linked to critical risk)
        if not requires_approval:
            old_data = {"control_owner_id": control.control_owner_id, "department_id": control.department_id}
            has_sensitive, changed = has_sensitive_field_changes("control", old_data, update_data)
            if has_sensitive:
                requires_approval = True
                approval_reason = f"Change to sensitive fields: {', '.join(changed.keys())}"
                pending_changes = changed
        
        if requires_approval:
            # Check for existing pending edit request
            existing = await db.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
                    ApprovalRequest.resource_id == control.id,
                    ApprovalRequest.action_type == ApprovalActionType.EDIT,
                    ApprovalRequest.status == ApprovalStatus.PENDING
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Edit request already pending for this control")
            
            name_snippet = control.name[:50] if control.name else ""
            approval = ApprovalRequest(
                resource_type=ApprovalResourceType.CONTROL,
                resource_id=control.id,
                resource_name=f"Control #{control.id}: {name_snippet}",
                requested_by_id=current_user.id,
                reason=approval_reason,
                action_type=ApprovalActionType.EDIT,
                pending_changes=pending_changes,
                status=ApprovalStatus.PENDING,
            )
            db.add(approval)
            await db.commit()
            
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content={
                    "message": "Change requires approval",
                    "approval_id": approval.id,
                    "action_type": "edit",
                    "pending_fields": list(pending_changes.keys()),
                    "pending_changes": pending_changes
                }
            )
    
    for field, value in update_data.items():
        if hasattr(value, 'value'):  # Handle enums
            value = value.value
        setattr(control, field, value)
    
    control.updated_by_id = current_user.id
    
    await db.commit()
    await db.refresh(control)
    
    # Reload with relationships
    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
        )
        .where(Control.id == control.id)
    )
    return result.scalar_one()


@router.delete("/{control_id}", status_code=status.HTTP_202_ACCEPTED)
async def delete_control(
    control_id: int,
    reason: str = Query(..., min_length=1, description="Reason for deletion (mandatory)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "delete")),
):
    """
    Request deletion of a control.
    - Risk Manager/CRO/Admin: deletes immediately (204)
    - Others: creates approval request (202), item stays visible
    """
    from app.core.permissions import can_resolve_approvals
    from app.models import ApprovalRequest, ApprovalStatus, ApprovalResourceType
    from fastapi.responses import Response
    
    result = await db.execute(
        select(Control).where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Verify department access
    check_department_access(control.department_id, current_user)
    
    # Privileged users can delete immediately
    if can_resolve_approvals(current_user):
        control.status = ControlStatusEnum.archived.value
        control.updated_by_id = current_user.id
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    
    # Check for existing pending request
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            ApprovalRequest.resource_id == control.id,
            ApprovalRequest.status == ApprovalStatus.PENDING
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending")
    
    # Create approval request - ITEM STAYS VISIBLE
    name_snippet = control.name[:50] if control.name else ""
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        resource_name=f"Control #{control.id}: {name_snippet}",
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
    )
    db.add(approval)
    await db.commit()
    
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "message": "Deletion request submitted for approval",
            "approval_id": approval.id,
            "action_type": "delete"
        }
    )


# ============== Control Execution Endpoints ==============

def calculate_next_scheduled(frequency: str, executed_at: datetime) -> datetime:
    """Calculate next scheduled execution based on frequency."""
    frequency_deltas = {
        "daily": timedelta(days=1),
        "weekly": timedelta(weeks=1),
        "monthly": timedelta(days=30),
        "quarterly": timedelta(days=90),
        "annually": timedelta(days=365),
        "ad_hoc": timedelta(days=30),  # Default to monthly for ad-hoc
    }
    return executed_at + frequency_deltas.get(frequency, timedelta(days=30))


@router.post("/{control_id}/executions", response_model=ControlExecutionRead, status_code=status.HTTP_201_CREATED)
async def log_execution(
    control_id: int,
    execution_data: ControlExecutionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Log a control execution."""
    # Verify control exists
    result = await db.execute(
        select(Control).where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Verify department access
    check_department_access(control.department_id, current_user)
    
    executed_at = datetime.now(UTC)
    next_scheduled = calculate_next_scheduled(control.frequency, executed_at)
    
    execution = ControlExecution(
        control_id=control_id,
        executed_by_id=current_user.id,
        executed_at=executed_at,
        result=execution_data.result.value,
        findings=execution_data.findings,
        evidence_reference=execution_data.evidence_reference,
        notes=execution_data.notes,
        next_scheduled=next_scheduled,
    )
    
    db.add(execution)
    await db.commit()
    await db.refresh(execution)
    
    # Reload with relationships
    result = await db.execute(
        select(ControlExecution)
        .options(selectinload(ControlExecution.executed_by))
        .where(ControlExecution.id == execution.id)
    )
    return result.scalar_one()


@router.get("/{control_id}/executions", response_model=list[ControlExecutionRead])
async def list_executions(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """List execution history for a control."""
    # Verify control exists
    result = await db.execute(
        select(Control).where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Verify department access
    check_department_access(control.department_id, current_user)
    
    result = await db.execute(
        select(ControlExecution)
        .options(selectinload(ControlExecution.executed_by))
        .where(ControlExecution.control_id == control_id)
        .order_by(ControlExecution.executed_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


# ============== Control-Risk Linking Endpoints ==============

@router.get("/{control_id}/risks", response_model=list[ControlRiskLinkRead])
async def list_control_risks(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List risks that this control mitigates."""
    # Verify control exists
    result = await db.execute(
        select(Control).where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Verify department access
    check_department_access(control.department_id, current_user)
    
    result = await db.execute(
        select(ControlRiskLink)
        .options(
            selectinload(ControlRiskLink.risk),
            selectinload(ControlRiskLink.control),
        )
        .where(ControlRiskLink.control_id == control_id)
    )
    return result.scalars().all()


@router.post("/{control_id}/risks", response_model=ControlRiskLinkRead, status_code=status.HTTP_201_CREATED)
async def link_control_to_risk(
    control_id: int,
    link_data: ControlRiskLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "write")),
):
    """Link a control to a risk."""
    from app.models import Risk
    
    # Verify control exists
    result = await db.execute(
        select(Control).where(Control.id == control_id)
    )
    control = result.scalar_one_or_none()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    # Verify department access for control
    check_department_access(control.department_id, current_user)
    
    # Verify risk exists
    result = await db.execute(
        select(Risk).where(Risk.id == link_data.risk_id)
    )
    risk = result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    
    # Verify department access for risk
    check_department_access(risk.department_id, current_user)
    
    # Check if link already exists
    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.control_id == control_id)
        .where(ControlRiskLink.risk_id == link_data.risk_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")
    
    link = ControlRiskLink(
        control_id=control_id,
        risk_id=link_data.risk_id,
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
            selectinload(ControlRiskLink.risk),
            selectinload(ControlRiskLink.control),
        )
        .where(ControlRiskLink.id == link.id)
    )
    return result.scalar_one()


@router.delete("/{control_id}/risks/{risk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_control_from_risk(
    control_id: int,
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "write")),
):
    """Remove link between control and risk."""
    result = await db.execute(
        select(ControlRiskLink)
        .where(ControlRiskLink.control_id == control_id)
        .where(ControlRiskLink.risk_id == risk_id)
    )
    link = result.scalar_one_or_none()
    
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    
    # Verify department access for both control and risk
    # (Since the link exists, we should verify the user can access both sides)
    result = await db.execute(select(Control).where(Control.id == control_id))
    control = result.scalar_one_or_none()
    if control:
        check_department_access(control.department_id, current_user)
        
    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if risk:
        check_department_access(risk.department_id, current_user)
    
    await db.delete(link)
    await db.commit()
