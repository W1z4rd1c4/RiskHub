from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.mappers.risk import risk_to_summary
from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import (
    check_department_access,
    get_user_department_ids,
)
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import ControlRiskLink, KeyRiskIndicator, Risk, RiskTypeConfig, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.risk import (
    RiskCreate,
    RiskListResponse,
    RiskRead,
    RiskStatusEnum,
    RiskUpdate,
)

from .id_generation import generate_risk_id_code

router = APIRouter()


async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:
    """Validate that the risk_type code exists in the active risk_types config."""
    result = await db.execute(
        select(RiskTypeConfig).where(RiskTypeConfig.code == risk_type_code, RiskTypeConfig.is_active.is_(True))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown risk type '{risk_type_code}'. Available types can be viewed in Risk Hub configuration.",
        )


# ============== CRUD Operations ==============


@router.get("", response_model=RiskListResponse)
async def list_risks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[RiskStatusEnum] = None,
    risk_type: Optional[str] = None,
    is_priority: Optional[bool] = None,
    search: Optional[str] = None,
    include_archived: bool = Query(False, description="Include archived risks in results"),
    has_breach: Optional[bool] = None,
    min_net_score: Optional[int] = Query(
        None, ge=0, le=25, description="Filter risks with net_score >= this value (e.g., 15 for critical)"
    ),
    sort_by: Optional[str] = Query(None, description="Field to sort by"),
    sort_order: Optional[str] = Query("asc", description="Sort order (asc or desc)"),
    process: Optional[str] = Query(None, description="Filter by process name"),
    category: Optional[str] = Query(None, description="Filter by category"),
) -> RiskListResponse:
    """
    List risks with pagination and filters.
    Department heads without admin/cro/risk_manager role see only their department's risks.
    Also includes risks where user is reporting owner of any linked KRI or control owner.
    Returns paginated response with total count.
    """
    from app.core.permissions import get_risk_ids_where_control_owner, get_risk_ids_where_kri_reporting_owner

    base_query = select(Risk)

    # Department filtering based on role
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:  # If not empty, user is restricted to specific departments
        # Include risks from user's departments OR where user is direct risk owner OR
        # where user is KRI reporting owner/control owner on linked entities.
        reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, current_user.id)
        control_owner_risk_ids = await get_risk_ids_where_control_owner(db, current_user.id)
        cross_dept_risk_ids = set(reporting_owner_risk_ids) | set(control_owner_risk_ids)

        if cross_dept_risk_ids:
            base_query = base_query.where(
                or_(
                    Risk.department_id.in_(dept_ids), Risk.owner_id == current_user.id, Risk.id.in_(cross_dept_risk_ids)
                )
            )
        else:
            base_query = base_query.where(
                or_(
                    Risk.department_id.in_(dept_ids),
                    Risk.owner_id == current_user.id,
                )
            )
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
        base_query = base_query.where(Risk.risk_type == risk_type)

    # Priority filter
    if is_priority is not None:
        base_query = base_query.where(Risk.is_priority == is_priority)

    # Search filter
    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Risk.risk_id_code.ilike(search_pattern),
                Risk.name.ilike(search_pattern),
                Risk.description.ilike(search_pattern),
                Risk.process.ilike(search_pattern),
            )
        )
    # Breach filter
    if has_breach is not None:
        breaching_subq = (
            select(KeyRiskIndicator.risk_id)
            .where(
                or_(
                    KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
                    KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
                )
            )
            .scalar_subquery()
        )

        if has_breach:
            base_query = base_query.where(Risk.id.in_(breaching_subq))
        else:
            base_query = base_query.where(Risk.id.notin_(breaching_subq))

    # Net score filter (for critical risks: min_net_score=15)
    if min_net_score is not None:
        base_query = base_query.where(Risk.net_score >= min_net_score)

    # Process filter (for link dialog filtering)
    if process:
        base_query = base_query.where(Risk.process == process)

    # Category filter (for link dialog filtering)
    if category:
        base_query = base_query.where(Risk.category == category)

    # Get total count before pagination
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Determine sort column
    order_column = Risk.risk_id_code  # Default sort

    if sort_by:
        if sort_by == "name":
            order_column = Risk.name
        elif sort_by == "description":
            order_column = Risk.description
        elif sort_by == "status":
            order_column = Risk.status
        elif sort_by == "risk_id_code":
            order_column = Risk.risk_id_code
        elif sort_by == "category":
            order_column = Risk.category
        elif sort_by == "type":  # Frontend sends 'type' for risk type
            order_column = Risk.risk_type
        elif sort_by == "risk_type":
            order_column = Risk.risk_type
        elif sort_by == "gross_score":
            order_column = Risk.gross_score
        elif sort_by == "net_score":
            order_column = Risk.net_score
        elif sort_by == "kri_count":
            order_column = (
                select(func.count(KeyRiskIndicator.id)).where(KeyRiskIndicator.risk_id == Risk.id).scalar_subquery()
            )
        elif sort_by == "control_count":
            order_column = (
                select(func.count(ControlRiskLink.id)).where(ControlRiskLink.risk_id == Risk.id).scalar_subquery()
            )

    # Apply sort order
    if sort_order == "desc":
        base_query = base_query.order_by(desc(order_column))
    else:
        base_query = base_query.order_by(asc(order_column))

    # Apply pagination
    query = (
        base_query.options(selectinload(Risk.department), selectinload(Risk.kris), selectinload(Risk.control_links))
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    risks = result.scalars().all()

    return RiskListResponse(items=[risk_to_summary(r) for r in risks], total=total, skip=skip, limit=limit)


@router.get("/{risk_id}", response_model=RiskRead)
async def get_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "read")),
):
    """Get a single risk with all relationships."""
    from app.core.permissions import is_risk_control_owner, is_risk_kri_reporting_owner

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

    # Allow access if user is direct risk owner (cross-department ownership).
    if risk.owner_id == current_user.id:
        return risk

    # Allow access if user is reporting owner of any linked KRI (cross-department)
    if await is_risk_kri_reporting_owner(db, current_user.id, risk_id):
        return risk

    # Allow access if user is control owner of any linked control (cross-department)
    if await is_risk_control_owner(db, current_user.id, risk_id):
        return risk

    # Otherwise verify department access
    try:
        check_department_access(risk.department_id, current_user)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Risk not found")

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

    # Validate risk type against dynamic configuration
    await validate_risk_type(db, risk_data.risk_type)

    # Prepare for atomic retry pattern
    risk_id_code = risk_data.risk_id_code
    auto_generated = not risk_id_code

    MAX_RETRIES = 5
    for attempt in range(MAX_RETRIES):
        try:
            if auto_generated:
                risk_id_code = await generate_risk_id_code(db, risk_data.process)

            # Calculate scores
            gross_score = risk_data.gross_probability * risk_data.gross_impact
            net_score = risk_data.net_probability * risk_data.net_impact

            risk = Risk(
                risk_id_code=risk_id_code,
                name=risk_data.name,
                process=risk_data.process,
                subprocess=risk_data.subprocess,
                risk_type=risk_data.risk_type,
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
            await db.flush()

            # Log activity within the same transaction
            await log_activity(
                db,
                entity_type=ActivityEntityType.RISK,
                entity_id=risk.id,
                entity_name=f"{risk.risk_id_code}: {risk.description[:50] if risk.description else risk.name}",
                action=ActivityAction.CREATE,
                actor=current_user,
                department_id=risk.department_id,
            )
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

        except IntegrityError:
            await db.rollback()

            # Only retry for auto-generated IDs (user-provided ID collision should fail)
            if not auto_generated:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail=f"Risk ID '{risk_id_code}' already exists"
                )

            # Retry with fresh ID for auto-generated
            if attempt < MAX_RETRIES - 1:
                continue

    # All retries exhausted
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not generate unique Risk ID after retries. Please try again.",
    )


@router.patch("/{risk_id}", response_model=RiskRead)
async def update_risk(
    risk_id: int,
    risk_data: RiskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Update a risk. Requires risks:write permission OR being the risk owner.
    Non-privileged users changing sensitive fields (owner, department, category, is_priority)
    will trigger an approval request instead of immediate update.
    """

    from app.core.permissions import can_resolve_approvals, has_sensitive_field_changes
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()

    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")

    # Check permission: either risks:write or is risk owner
    has_write = check_permission(current_user, "risks", "write")
    is_owner = risk.owner_id == current_user.id

    # Risk owners can edit their risk regardless of department (cross-department access)
    # per BUSINESS_LOGIC.md §7.1
    if not is_owner:
        # Verify department access only for non-owners
        check_department_access(risk.department_id, current_user)

    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:write or risk owner required"
        )

    # Update fields
    update_data = risk_data.model_dump(exclude_unset=True)

    # Validate risk type if being updated
    if "risk_type" in update_data:
        await validate_risk_type(db, update_data["risk_type"])

    # Prevent un-archiving via update
    if risk.status == RiskStatusEnum.archived.value:
        if "status" in update_data and update_data["status"] != RiskStatusEnum.archived.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reactivate archived risk. Please create a new risk or contact administrator.",
            )

    # Check for pending DELETE request (block any updates if delete is pending)
    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.RISK,
            ApprovalRequest.resource_id == risk.id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cannot update risk while deletion is pending approval")

    # Check for sensitive field changes OR priority risk edits (non-privileged users only)
    if not can_resolve_approvals(current_user):
        old_data = {
            "owner_id": risk.owner_id,
            "department_id": risk.department_id,
            "category": risk.category,
            "is_priority": risk.is_priority,
        }
        has_sensitive, changed = has_sensitive_field_changes("risk", old_data, update_data)

        # NEW: Any edit on a priority risk requires approval
        is_priority_risk_edit = risk.is_priority and bool(update_data)

        if has_sensitive or is_priority_risk_edit:
            # Check for existing pending edit request (both statuses)
            existing = await db.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.resource_type == ApprovalResourceType.RISK,
                    ApprovalRequest.resource_id == risk.id,
                    ApprovalRequest.action_type == ApprovalActionType.EDIT,
                    ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Edit request already pending for this risk")

            # Build pending_changes for all fields being changed (not just sensitive ones)
            if is_priority_risk_edit and not has_sensitive:
                # For priority risks, include ALL changes in the approval request
                changed = {}
                for field, new_val in update_data.items():
                    old_val = getattr(risk, field, None)
                    if hasattr(new_val, "value"):  # Handle enums
                        new_val = new_val.value
                    if old_val != new_val:
                        changed[field] = {"old": old_val, "new": new_val}

            # Create approval request instead of applying changes
            desc_snippet = risk.description[:50] if risk.description else ""
            reason = (
                f"Edit to priority risk - fields: {', '.join(changed.keys())}"
                if is_priority_risk_edit and not has_sensitive
                else f"Change to sensitive fields: {', '.join(changed.keys())}"
            )
            approval = ApprovalRequest(
                resource_type=ApprovalResourceType.RISK,
                resource_id=risk.id,
                resource_name=f"{risk.risk_id_code}: {desc_snippet}",
                requested_by_id=current_user.id,
                reason=reason,
                action_type=ApprovalActionType.EDIT,
                pending_changes=changed,
                status=ApprovalStatus.PENDING,
            )

            from app.core.approval_helpers import create_approval_request_with_audit

            await create_approval_request_with_audit(
                db,
                approval=approval,
                actor=current_user,
                department_id=risk.department_id,
            )

            # Return 202 with approval info
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content={
                    "message": "Change requires approval" + (" (priority risk)" if is_priority_risk_edit else ""),
                    "approval_id": approval.id,
                    "action_type": "edit",
                    "pending_fields": list(changed.keys()),
                    "pending_changes": changed,
                },
            )

    new_gross_probability = update_data.get("gross_probability", risk.gross_probability)
    new_gross_impact = update_data.get("gross_impact", risk.gross_impact)
    new_net_probability = update_data.get("net_probability", risk.net_probability)
    new_net_impact = update_data.get("net_impact", risk.net_impact)
    extra_changes = {}
    if "gross_probability" in update_data or "gross_impact" in update_data:
        extra_changes["gross_score"] = {
            "old": risk.gross_score,
            "new": new_gross_probability * new_gross_impact,
        }
    if "net_probability" in update_data or "net_impact" in update_data:
        extra_changes["net_score"] = {
            "old": risk.net_score,
            "new": new_net_probability * new_net_impact,
        }

    changes = build_change_set(risk, update_data, extra_changes=extra_changes)

    for field, value in update_data.items():
        if hasattr(value, "value"):  # Handle enums
            value = value.value
        setattr(risk, field, value)

    # Recalculate scores if probability/impact changed
    risk.gross_score = risk.gross_probability * risk.gross_impact
    risk.net_score = risk.net_probability * risk.net_impact

    # Log activity within the same transaction
    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK,
        entity_id=risk.id,
        entity_name=f"{risk.risk_id_code}: {risk.description[:50]}",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=risk.department_id,
        changes=changes,
    )
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
    from fastapi.responses import Response

    from app.core.permissions import can_resolve_approvals, check_department_access
    from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus

    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()

    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")

    # Allow risk owners to request deletion regardless of department (cross-department access)
    # per BUSINESS_LOGIC.md §7.1
    is_owner = risk.owner_id == current_user.id
    if not is_owner:
        # Verify department access only for non-owners
        check_department_access(risk.department_id, current_user)

    # Privileged users can delete immediately
    if can_resolve_approvals(current_user):
        risk.status = RiskStatusEnum.archived.value

        # Log activity within the same transaction
        await log_activity(
            db,
            entity_type=ActivityEntityType.RISK,
            entity_id=risk.id,
            entity_name=f"{risk.risk_id_code}",
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=risk.department_id,
        )
        await db.commit()

        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # Check for existing pending request (both PENDING and PENDING_PRIVILEGED)
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.RISK,
            ApprovalRequest.resource_id == risk.id,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending")

    # Create approval request - ITEM STAYS VISIBLE
    # Store risk name and description for better workflow display
    desc_snippet = (
        (risk.description[:100] + "...")
        if risk.description and len(risk.description) > 100
        else (risk.description or "")
    )

    # Determine primary approver: Risk Owner (if not self)
    primary_approver_id = risk.owner_id if risk.owner_id != current_user.id else None

    # Fallback to department head if no owner or self-approval
    if not primary_approver_id and risk.department_id:
        from app.models import Department

        dept_result = await db.execute(select(Department).where(Department.id == risk.department_id))
        dept = dept_result.scalar_one_or_none()
        if dept and dept.manager_id and dept.manager_id != current_user.id:
            primary_approver_id = dept.manager_id

    # Determine if privileged approval is needed (priority risks)
    requires_privileged = bool(risk.is_priority)

    from app.models import ApprovalActionType

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        resource_name=risk.name,  # Use risk name for display
        requested_by_id=current_user.id,
        reason=f"{reason}\n\nDescription: {desc_snippet}" if desc_snippet else reason,
        status=ApprovalStatus.PENDING,
        action_type=ApprovalActionType.DELETE,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )

    from app.core.approval_helpers import create_approval_request_with_audit

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=risk.department_id,
    )

    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "message": "Deletion request submitted for approval",
            "approval_id": approval.id,
            "action_type": "delete",
        },
    )


@router.post("/{risk_id}/restore", response_model=RiskRead)
async def restore_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "delete")),
):
    """Restore an archived risk back to active status."""
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

    # Mirror delete semantics: risk owners can restore cross-department
    is_owner = risk.owner_id == current_user.id
    if not is_owner:
        check_department_access(risk.department_id, current_user)

    if risk.status != RiskStatusEnum.archived.value:
        raise HTTPException(status_code=400, detail="Risk is not archived")

    changes = build_change_set(risk, {"status": RiskStatusEnum.active.value})
    risk.status = RiskStatusEnum.active.value

    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK,
        entity_id=risk.id,
        entity_name=f"{risk.risk_id_code}",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=risk.department_id,
        changes=changes,
        description=f"Restored risk {risk.risk_id_code}",
    )
    await db.commit()
    await db.refresh(risk)

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
