from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.activity_logger import build_change_set, log_activity
from app.core.permissions import check_department_access
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import Control, ControlRiskLink, Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.control import (
    ControlCreate,
    ControlFormEnum,
    ControlListResponse,
    ControlRead,
    ControlStatusEnum,
    ControlSummary,
    ControlUpdate,
    normalize_control_frequency,
)

from ._helpers import (
    _apply_department_scoping,
    _apply_process_category_filters,
    _build_pending_changes,
    _first_high_risk_linked_risk,
)

router = APIRouter()


# ============== CRUD Operations ==============


@router.get("", response_model=ControlListResponse)
async def list_controls(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    department_id: Optional[int] = None,
    status: Optional[ControlStatusEnum] = None,
    include_archived: bool = Query(False, description="Include archived controls in results"),
    search: Optional[str] = None,
    process: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
):
    """
    List controls with pagination and filters.
    Department heads without admin/cro/risk_manager role see only their department's controls.
    Also includes controls where user is the control owner.
    Returns paginated response with total count.
    """
    base_query = select(Control)

    # Apply department-based scoping
    base_query = await _apply_department_scoping(db, base_query, current_user, department_id)

    # Status filter
    if status:
        base_query = base_query.where(Control.status == status.value)
    elif not include_archived:
        # Default: exclude archived
        base_query = base_query.where(Control.status != ControlStatusEnum.archived.value)

    # Join for secondary search fields (Risk via ControlRiskLink)
    from sqlalchemy.orm import aliased

    from app.models.department import Department

    RiskDept = aliased(Department)

    base_query = base_query.outerjoin(Control.department)
    base_query = base_query.outerjoin(Control.risk_links).outerjoin(ControlRiskLink.risk)
    base_query = base_query.outerjoin(RiskDept, Risk.department_id == RiskDept.id)

    # Search filter
    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.where(
            or_(
                Control.name.ilike(search_pattern),
                Control.description.ilike(search_pattern),
                Department.name.ilike(search_pattern),
                Risk.name.ilike(search_pattern),
                Risk.description.ilike(search_pattern),
                Risk.risk_id_code.ilike(search_pattern),
                RiskDept.name.ilike(search_pattern),
            )
        )

    # Distinct because of risk joins
    base_query = base_query.distinct()

    # Apply optional process/category filters
    base_query = _apply_process_category_filters(base_query, process, category)

    # Get total count before pagination
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering with eager loading
    query = (
        base_query.options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
            selectinload(Control.risk_links)
            .selectinload(ControlRiskLink.risk)
            .options(selectinload(Risk.owner), selectinload(Risk.department)),
        )
        .offset(skip)
        .limit(limit)
        .order_by(Control.name)
    )

    result = await db.execute(query)
    controls = result.scalars().all()

    # Map to summary with department_name and risk info
    from app.core.permissions import (
        can_access_department_id,
        get_risk_ids_where_control_owner,
        get_risk_ids_where_kri_reporting_owner,
    )

    can_read_risks = check_permission(current_user, "risks", "read")
    cross_dept_risk_ids: set[int] = set()
    if can_read_risks:
        reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, current_user.id)
        control_owner_risk_ids = await get_risk_ids_where_control_owner(db, current_user.id)
        cross_dept_risk_ids = set(reporting_owner_risk_ids) | set(control_owner_risk_ids)

    items = []
    for c in controls:
        # Get first linked risk for grouping purposes
        first_risk = c.risk_links[0].risk if c.risk_links else None

        risk_visible = False
        if first_risk and can_read_risks:
            risk_visible = can_access_department_id(current_user, first_risk.department_id) or (
                first_risk.id in cross_dept_risk_ids
            )

        items.append(
            ControlSummary(
                id=c.id,
                name=c.name,
                description=c.description,
                department_id=c.department_id,
                department_name=c.department.name if c.department else None,
                frequency=normalize_control_frequency(c.frequency),
                risk_level=c.risk_level,
                status=ControlStatusEnum(c.status),
                control_form=ControlFormEnum(c.control_form),
                control_owner_name=c.control_owner.name if c.control_owner else None,
                risk_type=first_risk.risk_type if (first_risk and risk_visible) else None,
                risk_id_code=first_risk.risk_id_code if (first_risk and risk_visible) else None,
                risk_description=first_risk.description if (first_risk and risk_visible) else None,
                risk_name=first_risk.name if (first_risk and risk_visible) else None,
                risk_owner_name=first_risk.owner.name if (first_risk and risk_visible and first_risk.owner) else None,
                risk_department_name=first_risk.department.name
                if (first_risk and risk_visible and first_risk.department)
                else None,
            )
        )

    return ControlListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/{control_id}", response_model=ControlRead)
async def get_control(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "read")),
):
    """Get a single control with all relationships."""
    from app.core.permissions import is_control_owner

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

    # Allow access if user is control owner (cross-department)
    if await is_control_owner(db, current_user.id, control_id):
        return control

    # Otherwise verify department access
    try:
        check_department_access(control.department_id, current_user)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Control not found")

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
    await db.flush()

    # Log activity within the same transaction
    await log_activity(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=f"{control.name}",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=control.department_id,
    )
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

    from app.core.permissions import (
        can_resolve_approvals,
        has_sensitive_field_changes,
        is_control_owner,
    )
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    result = await db.execute(select(Control).where(Control.id == control_id))
    control = result.scalar_one_or_none()

    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    # Check permission: either controls:write or is control owner
    has_write = check_permission(current_user, "controls", "write")
    is_owner = await is_control_owner(db, current_user.id, control_id)

    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: controls:write or control owner required"
        )

    # Verify department access (skipped for control owners)
    if not is_owner:
        check_department_access(control.department_id, current_user)

    # Update fields
    update_data = control_data.model_dump(exclude_unset=True)

    # Check for pending DELETE request (block any updates if delete is pending)
    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            ApprovalRequest.resource_id == control.id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cannot update control while deletion is pending approval")

    # Check for approval requirements (non-privileged users only)
    if not can_resolve_approvals(current_user):
        from app.core.approval_helpers import (
            check_control_requires_privileged_approval,
            create_approval_request_with_audit,
            get_primary_approver_for_control,
        )

        requires_approval = False
        approval_reason = ""
        pending_changes = {}
        is_priority_linked = False

        # Check 1: Is control linked to critical risk?
        is_priority_linked, high_risk = await _first_high_risk_linked_risk(db, control.id)
        if is_priority_linked and high_risk:
            requires_approval = True
            approval_reason = f"Edit to control linked to critical risk {high_risk.risk_id_code}"
            pending_changes = _build_pending_changes(control, update_data)

        # Check 2: Sensitive field changes (even if not linked to critical risk)
        if not requires_approval:
            old_data = {"control_owner_id": control.control_owner_id, "department_id": control.department_id}
            has_sensitive, changed = has_sensitive_field_changes("control", old_data, update_data)
            if has_sensitive:
                requires_approval = True
                approval_reason = f"Change to sensitive fields: {', '.join(changed.keys())}"
                pending_changes = changed

        # Check 3: Owner edits always require approval (even non-critical controls)
        if not requires_approval and is_owner:
            requires_approval = True
            approval_reason = "Control owner edit requires Risk Owner approval"
            pending_changes = _build_pending_changes(control, update_data)
            # Check if any linked risk is priority
            is_priority_linked = await check_control_requires_privileged_approval(db, control.id)

        if requires_approval:
            # Check for existing pending edit request
            existing = await db.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
                    ApprovalRequest.resource_id == control.id,
                    ApprovalRequest.action_type == ApprovalActionType.EDIT,
                    ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Edit request already pending for this control")

            # Get primary approver (Risk Owner of highest-priority linked risk)
            primary_approver_id = await get_primary_approver_for_control(db, control.id)

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
                primary_approver_id=primary_approver_id,
                requires_privileged_approval=is_priority_linked,
            )

            await create_approval_request_with_audit(
                db,
                approval=approval,
                actor=current_user,
                department_id=control.department_id,
            )

            # Notify Approvers
            try:
                from app.models.notification import NotificationType
                from app.services.notification_service import NotificationService

                # 1. Notify Primary Approver (Risk Owner)
                if primary_approver_id:
                    await NotificationService.create_notification(
                        db=db,
                        user_id=primary_approver_id,
                        notification_type=NotificationType.APPROVAL_PENDING,
                        title="Control Edit Request",
                        message=f"Control '{name_snippet}' has been edited and requires your approval.",
                        resource_type="approval",
                        resource_id=approval.id,
                    )

                # 2. Notify other privileged approvers (CROs, Risk Managers)
                await NotificationService.notify_approvers(db, approval)

                await db.commit()
            except Exception as e:
                await db.rollback()
                import logging

                logging.getLogger(__name__).warning(
                    f"Failed to notify approvers for control edit approval #{approval.id}: {e}"
                )

            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content={
                    "message": "Change requires approval",
                    "approval_id": approval.id,
                    "action_type": "edit",
                    "pending_fields": list(pending_changes.keys()),
                    "pending_changes": pending_changes,
                    "primary_approver_id": primary_approver_id,
                    "requires_privileged_approval": is_priority_linked,
                },
            )

    changes = build_change_set(control, update_data)

    for field, value in update_data.items():
        if hasattr(value, "value"):  # Handle enums
            value = value.value
        setattr(control, field, value)

    control.updated_by_id = current_user.id

    # Log activity within the same transaction
    await log_activity(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=f"{control.name}",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=control.department_id,
        changes=changes,
    )
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
    from fastapi.responses import Response

    from app.core.permissions import can_resolve_approvals
    from app.models import ApprovalRequest, ApprovalResourceType, ApprovalStatus

    result = await db.execute(select(Control).where(Control.id == control_id))
    control = result.scalar_one_or_none()

    if not control:
        raise HTTPException(status_code=404, detail="Control not found")

    # Verify department access
    check_department_access(control.department_id, current_user)

    # Privileged users can delete immediately
    if can_resolve_approvals(current_user):
        control.status = ControlStatusEnum.archived.value
        control.updated_by_id = current_user.id

        # Log activity within the same transaction
        await log_activity(
            db,
            entity_type=ActivityEntityType.CONTROL,
            entity_id=control.id,
            entity_name=f"{control.name}",
            action=ActivityAction.ARCHIVE,
            actor=current_user,
            department_id=control.department_id,
        )
        await db.commit()

        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # Check for existing pending request (both PENDING and PENDING_PRIVILEGED)
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            ApprovalRequest.resource_id == control.id,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Deletion request already pending")

    # Create approval request - ITEM STAYS VISIBLE
    name_snippet = control.name[:50] if control.name else ""

    # Get primary approver (Risk Owner of highest-priority linked risk)
    from app.core.approval_helpers import (
        check_control_requires_privileged_approval,
        create_approval_request_with_audit,
        get_primary_approver_for_control,
    )
    from app.models import ApprovalActionType

    primary_approver_id = await get_primary_approver_for_control(db, control.id)
    if primary_approver_id == current_user.id:
        primary_approver_id = None  # Prevent self-approval

    requires_privileged = await check_control_requires_privileged_approval(db, control.id)

    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        resource_name=f"Control #{control.id}: {name_snippet}",
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        action_type=ApprovalActionType.DELETE,
        primary_approver_id=primary_approver_id,
        requires_privileged_approval=requires_privileged,
    )

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=control.department_id,
    )

    # Needs logic to find primary approver for delete requests as well
    from app.core.approval_helpers import get_primary_approver_for_control

    primary_approver_id = await get_primary_approver_for_control(db, control.id)

    try:
        from app.models.notification import NotificationType
        from app.services.notification_service import NotificationService

        # 1. Notify Primary Approver
        if primary_approver_id:
            await NotificationService.create_notification(
                db=db,
                user_id=primary_approver_id,
                notification_type=NotificationType.APPROVAL_PENDING,
                title="Control Deletion Request",
                message=f"Request to delete control '{name_snippet}' requires your approval.",
                resource_type="approval",
                resource_id=approval.id,
            )

        # 2. Notify other privileged approvers (CROs, Risk Managers)
        await NotificationService.notify_approvers(db, approval)

        await db.commit()
    except Exception as e:
        await db.rollback()
        import logging

        logging.getLogger(__name__).warning(
            f"Failed to notify approvers for control delete approval #{approval.id}: {e}"
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


@router.post("/{control_id}/restore", response_model=ControlRead)
async def restore_control(
    control_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("controls", "delete")),
):
    """Restore an archived control back to active status."""
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

    try:
        check_department_access(control.department_id, current_user)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Control not found")

    if control.status != ControlStatusEnum.archived.value:
        raise HTTPException(status_code=400, detail="Control is not archived")

    changes = build_change_set(
        control,
        {"status": ControlStatusEnum.active.value, "updated_by_id": current_user.id},
    )
    control.status = ControlStatusEnum.active.value
    control.updated_by_id = current_user.id

    await log_activity(
        db,
        entity_type=ActivityEntityType.CONTROL,
        entity_id=control.id,
        entity_name=f"{control.name}",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=control.department_id,
        changes=changes,
        description=f"Restored control {control.name}",
    )
    await db.commit()
    await db.refresh(control)

    result = await db.execute(
        select(Control)
        .options(
            selectinload(Control.department),
            selectinload(Control.control_owner),
        )
        .where(Control.id == control.id)
    )
    return result.scalar_one()
