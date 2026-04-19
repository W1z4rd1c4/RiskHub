from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_kri_response
from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import utc_now
from app.core.owner_reference_validation import validate_active_owner_reference
from app.core.permissions import can_read_vendor, check_department_access
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User, VendorKRILink
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.approval_request import ApprovalQueuedResponse
from app.schemas.kri import KRIResponse, KRIUpdate
from app.schemas.vendor_shared import LinkedVendorRead
from app.services.kri_vendor_assignment import (
    assign_vendors_to_kri,
    normalize_vendor_ids,
    validate_assignable_vendors,
)

router = APIRouter()
APPROVAL_QUEUED_RESPONSE = {202: {"model": ApprovalQueuedResponse}}


@router.put("/{kri_id}", response_model=KRIResponse, responses=APPROVAL_QUEUED_RESPONSE)
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
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk), selectinload(KeyRiskIndicator.vendor_links))
    )
    kri = result.scalar_one_or_none()

    if not kri:
        raise HTTPException(status_code=404, detail="KRI not found")

    # Verify department access
    check_department_access(kri.risk.department_id, current_user)

    # Block updates on archived KRIs
    if kri.is_archived:
        raise HTTPException(status_code=409, detail="Cannot update archived KRI")

    update_data = data.model_dump(exclude_unset=True)
    requested_vendor_ids = update_data.pop("linked_vendor_ids", None)
    normalized_vendor_ids = normalize_vendor_ids(requested_vendor_ids) if requested_vendor_ids is not None else None
    current_vendor_ids = sorted(link.vendor_id for link in getattr(kri, "vendor_links", []) or [])

    if normalized_vendor_ids is not None:
        await validate_assignable_vendors(
            db,
            current_user=current_user,
            vendor_ids=normalized_vendor_ids,
        )

    # Reject current_value updates via PUT - must use POST /kris/{id}/values
    if "current_value" in update_data:
        raise HTTPException(
            status_code=400,
            detail="Cannot update current_value via PUT. Use POST /kris/{id}/values to record new values.",
        )

    # Validate limits if both provided
    new_lower = update_data.get("lower_limit", kri.lower_limit)
    new_upper = update_data.get("upper_limit", kri.upper_limit)
    if new_lower >= new_upper:
        raise HTTPException(status_code=400, detail="lower_limit must be less than upper_limit")

    # Check for pending DELETE request (block any updates if delete is pending)
    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            ApprovalRequest.resource_id == kri.id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cannot update KRI while deletion is pending approval")
    if "reporting_owner_id" in update_data:
        await validate_active_owner_reference(
            db,
            user_id=update_data["reporting_owner_id"],
            label="Reporting owner",
        )

    # ALL KRI edits by non-privileged users require approval
    if not can_resolve_approvals(current_user):
        # Check for existing pending edit request
        existing = await db.execute(
            select(ApprovalRequest).where(
                ApprovalRequest.resource_type == ApprovalResourceType.KRI,
                ApprovalRequest.resource_id == kri.id,
                ApprovalRequest.action_type == ApprovalActionType.EDIT,
                ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Edit request already pending for this KRI")

        pending_changes = {k: {"old": getattr(kri, k, None), "new": v} for k, v in update_data.items()}
        if normalized_vendor_ids is not None and normalized_vendor_ids != current_vendor_ids:
            pending_changes["linked_vendor_ids"] = {
                "old": current_vendor_ids,
                "new": normalized_vendor_ids,
            }
        name_snippet = (kri.metric_name or "").strip()[:50]

        approval = ApprovalRequest(
            resource_type=ApprovalResourceType.KRI,
            resource_id=kri.id,
            resource_name=name_snippet or "Unknown KRI",
            requested_by_id=current_user.id,
            reason=f"Edit to KRI '{name_snippet}' requires approval",
            action_type=ApprovalActionType.EDIT,
            pending_changes=pending_changes,
            status=ApprovalStatus.PENDING,
        )
        from app.core.approval_helpers import create_approval_request_with_audit

        await create_approval_request_with_audit(
            db,
            approval=approval,
            actor=current_user,
            department_id=kri.risk.department_id,
        )

        from app.core.approval_helpers import build_approval_queued_response

        return build_approval_queued_response(
            message="Change requires approval",
            approval_id=approval.id,
            action_type="edit",
            pending_fields=list(pending_changes.keys()),
            pending_changes=pending_changes,
        )

    extra_changes = {}
    if normalized_vendor_ids is not None and normalized_vendor_ids != current_vendor_ids:
        extra_changes["linked_vendor_ids"] = {"old": current_vendor_ids, "new": normalized_vendor_ids}
    changes = build_change_set(kri, update_data, extra_changes=extra_changes)

    try:
        for field, value in update_data.items():
            setattr(kri, field, value)

        if normalized_vendor_ids is not None:
            await assign_vendors_to_kri(
                db,
                kri=kri,
                linked_vendor_ids=normalized_vendor_ids,
            )

        # Log activity within the same transaction
        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=f"{kri.metric_name}",
            safe_entity_label=kri.metric_name,
            action=ActivityAction.UPDATE,
            actor=current_user,
            department_id=kri.risk.department_id,
            changes=changes,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(kri)

    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri.id)
        .options(
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.owner),
            joinedload(KeyRiskIndicator.risk).joinedload(Risk.department),
            selectinload(KeyRiskIndicator.reporting_owner),
            selectinload(KeyRiskIndicator.vendor_links).selectinload(VendorKRILink.vendor),
        )
    )
    reloaded_kri = result.scalar_one()

    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return serialize_kri_response(
        reloaded_kri,
        monitoring_context,
        linked_vendors=[
            LinkedVendorRead(id=link.vendor.id, name=link.vendor.name)
            for link in getattr(reloaded_kri, "vendor_links", []) or []
            if getattr(link, "vendor", None) is not None
            and check_permission(current_user, "vendors", "read")
            and can_read_vendor(link.vendor, current_user)
        ],
    )
