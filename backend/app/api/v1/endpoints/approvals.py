"""Approval request endpoints for deletion and edit workflows."""
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.activity_logger import log_activity
from app.core.datetime_utils import utc_now
from app.core.permissions import can_resolve_approvals, check_department_access
from app.db.session import get_db
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    KeyRiskIndicator,
    Risk,
    User,
)
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.approval_request import (
    ApprovalRequestCreate,
    ApprovalRequestListResponse,
    ApprovalRequestRead,
    ApprovalRequestResolve,
    ApprovalResourceTypeEnum,
    ApprovalStatusEnum,
)
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter()


async def _notify_requester_resolved_background(
    engine: AsyncEngine,
    approval_id: int,
    approved: bool,
) -> None:
    """Background task: notify requester using a fresh DB session."""
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        result = await session.execute(select(ApprovalRequest).where(ApprovalRequest.id == approval_id))
        approval = result.scalar_one_or_none()
        if not approval:
            return
        try:
            await NotificationService.notify_requester_resolved(session, approval, approved=approved)
            await session.commit()
        except Exception:
            await session.rollback()


async def _get_approval_department_id(db: AsyncSession, approval: ApprovalRequest) -> int | None:
    if approval.resource_type == ApprovalResourceType.RISK:
        result = await db.execute(select(Risk.department_id).where(Risk.id == approval.resource_id))
        return result.scalar_one_or_none()
    if approval.resource_type == ApprovalResourceType.CONTROL:
        result = await db.execute(select(Control.department_id).where(Control.id == approval.resource_id))
        return result.scalar_one_or_none()
    if approval.resource_type == ApprovalResourceType.KRI:
        result = await db.execute(
            select(Risk.department_id)
            .join(KeyRiskIndicator, KeyRiskIndicator.risk_id == Risk.id)
            .where(KeyRiskIndicator.id == approval.resource_id)
        )
        return result.scalar_one_or_none()
    return None


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
        "status": approval.status.value.lower(),
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
    department_id: int | None = None
    if request_data.resource_type == ApprovalResourceTypeEnum.risk:
        result = await db.execute(select(Risk).where(Risk.id == request_data.resource_id))
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="Risk not found")
        # Verify requester has access to resource's department
        check_department_access(resource.department_id, current_user)
        resource_name = f"{resource.risk_id_code}: {resource.description[:50] if resource.description else ''}"
        department_id = resource.department_id
    elif request_data.resource_type == ApprovalResourceTypeEnum.control:
        result = await db.execute(select(Control).where(Control.id == request_data.resource_id))
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="Control not found")
        # Verify requester has access to resource's department
        check_department_access(resource.department_id, current_user)
        resource_name = f"Control #{resource.id}: {resource.name[:50] if resource.name else ''}"
        department_id = resource.department_id
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
        department_id = resource.risk.department_id

    # Check for existing pending request (both PENDING and PENDING_PRIVILEGED)
    existing = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType(request_data.resource_type.value),
            ApprovalRequest.resource_id == request_data.resource_id,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
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

    try:
        db.add(approval)
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        if "ux_approval_pending" in str(e).lower() or "unique constraint" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An approval request is already pending for this action."
            )
        raise

    await log_activity(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval.resource_name or f"{approval.resource_type.value}-{approval.resource_id}",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=department_id,
    )
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
    except Exception as e:
        await db.rollback()
        logger.warning(f"Failed to notify approvers for approval #{approval.id}: {e}")

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
    logger.info(f"List approvals: user={current_user.id} can_resolve={can_resolve_approvals(current_user)} filter={status_filter} my={my_requests}")
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
        if status_filter == ApprovalStatusEnum.pending:
            # Treat "pending" as the entire approval queue (incl. tier-2 privileged pending)
            base_query = base_query.where(
                ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED])
            )
        else:
            base_query = base_query.where(ApprovalRequest.status == ApprovalStatus(status_filter.value.upper()))
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

    valid_items = []
    for a in approvals:
        try:
            valid_items.append(_build_approval_read(a))
        except Exception as e:
            logger.error(f"Skipping corrupted approval request {a.id}: {e}")
            continue

    return ApprovalRequestListResponse(
        items=valid_items,
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
    background_tasks: BackgroundTasks,
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
    from app.services.approval_execution_service import (
        apply_side_effects,
        apply_status_transition,
        assert_can_approve,
        load_approval,
        log_approval_approve,
    )

    logger.info(f"Processing approval request {approval_id}")

    # 1) Load approval with relationships
    approval = await load_approval(db, approval_id)

    # 2) Authorize
    is_privileged, is_primary_approver = assert_can_approve(approval, current_user)

    previous_status = approval.status

    # 3) Transition status
    should_apply_changes = apply_status_transition(
        approval,
        current_user=current_user,
        resolution_notes=resolve_data.resolution_notes,
        is_privileged=is_privileged,
        is_primary_approver=is_primary_approver,
    )

    # 4) Apply side effects if approved
    if should_apply_changes:
        await apply_side_effects(db, approval, current_user)

        # Log approval APPROVE action
        if approval.status == ApprovalStatus.APPROVED:
            await log_approval_approve(db, approval, current_user, previous_status)

        # Commit changes
        try:
            logger.info("Flushing and committing changes...")
            await db.flush()
            await db.commit()
            logger.info("Commit successful")
        except Exception as e:
            import traceback
            logger.error(f"Error applying approval {approval_id}: {str(e)}")
            logger.error(traceback.format_exc())
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error during approval: {str(e)}")
    else:
        # PENDING → PENDING_PRIVILEGED: Log escalation and notify privileged users
        from app.services.approval_execution_service import get_approval_department_id

        # Log ESCALATE activity for audit trail
        department_id = await get_approval_department_id(db, approval)
        await log_activity(
            db,
            entity_type=ActivityEntityType.APPROVAL,
            entity_id=approval.id,
            entity_name=approval.resource_name or f"{approval.resource_type.value}-{approval.resource_id}",
            action=ActivityAction.ESCALATE,
            actor=current_user,
            department_id=department_id,
            changes={"status": {"old": previous_status.value, "new": approval.status.value}},
            description=f"Escalated to privileged approval by {current_user.name}",
        )

        try:
            await NotificationService.notify_approvers(db, approval)
        except Exception as e:
            logger.warning(f"Failed to notify approvers for PENDING_PRIVILEGED approval #{approval.id}: {e}")
        await db.commit()

    # Reload with relationships for response
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()

    # Notify requester in background (fresh DB session)
    if approval.status == ApprovalStatus.APPROVED and isinstance(db.bind, AsyncEngine):
        background_tasks.add_task(
            _notify_requester_resolved_background,
            db.bind,
            approval.id,
            True,
        )

    return _build_approval_read(approval)


@router.post("/{approval_id}/reject", response_model=ApprovalRequestRead)
async def reject_request(
    approval_id: int,
    resolve_data: ApprovalRequestResolve,
    background_tasks: BackgroundTasks,
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

    # Allow rejecting any pending status (PENDING or PENDING_PRIVILEGED)
    if approval.status not in (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED):
        raise HTTPException(status_code=400, detail=f"Cannot reject request with status: {approval.status.value}")

    previous_status = approval.status

    # Update approval status
    approval.status = ApprovalStatus.REJECTED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = utc_now()
    approval.resolution_notes = resolve_data.resolution_notes

    department_id = await _get_approval_department_id(db, approval)
    await log_activity(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval.resource_name or f"{approval.resource_type.value}-{approval.resource_id}",
        action=ActivityAction.REJECT,
        actor=current_user,
        department_id=department_id,
        changes={"status": {"old": previous_status.value, "new": approval.status.value}},
    )
    await db.commit()

    # Reload with relationships
    result = await db.execute(
        select(ApprovalRequest)
        .options(selectinload(ApprovalRequest.requested_by), selectinload(ApprovalRequest.resolved_by))
        .where(ApprovalRequest.id == approval.id)
    )
    approval = result.scalar_one()

    # Notify requester in the background (fresh DB session)
    if isinstance(db.bind, AsyncEngine):
        background_tasks.add_task(
            _notify_requester_resolved_background,
            db.bind,
            approval.id,
            False,
        )

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

    # §5.5: Request creator OR privileged users can cancel PENDING/PENDING_PRIVILEGED requests
    is_requester = approval.requested_by_id == current_user.id
    is_privileged = can_resolve_approvals(current_user)

    if not is_requester and not is_privileged:
        raise HTTPException(status_code=403, detail="Only the requester or privileged users can cancel requests")

    if approval.status not in (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED):
        raise HTTPException(status_code=400, detail=f"Cannot cancel request with status: {approval.status.value}")

    # Update status
    approval.status = ApprovalStatus.CANCELLED
    approval.resolved_by_id = current_user.id
    approval.resolved_at = utc_now()

    # Log activity for cancellation - distinguish self vs privileged
    department_id = await _get_approval_department_id(db, approval)
    if is_requester:
        cancel_description = "Approval request cancelled by requester"
    else:
        cancel_description = f"Approval request cancelled by {current_user.name} (privileged)"
    await log_activity(
        db,
        entity_type=ActivityEntityType.APPROVAL,
        entity_id=approval.id,
        entity_name=approval.resource_name or f"{approval.resource_type.value}-{approval.resource_id}",
        action=ActivityAction.CANCEL,
        actor=current_user,
        department_id=department_id,
        description=cancel_description,
    )

    # Notify approvers about cancellation
    await NotificationService.notify_approvers_cancelled(
        db=db,
        approval=approval,
        cancelled_by_user=current_user,
    )

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
