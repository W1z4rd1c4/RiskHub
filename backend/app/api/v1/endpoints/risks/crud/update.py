from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_risk_read
from app.core.datetime_utils import utc_now
from app.core.activity_logger import build_change_set, log_activity
from app.core.owner_reference_validation import validate_active_owner_reference
from app.core.permissions import check_department_access
from app.core.security import check_permission
from app.db.session import get_db
from app.models import Risk, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.risk import RiskRead, RiskStatusEnum, RiskUpdate

from ._shared import validate_risk_type

router = APIRouter()


async def _load_risk_or_404(db: AsyncSession, risk_id: int) -> Risk:
    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    return risk


def _assert_risk_update_access(risk: Risk, current_user: User) -> tuple[bool, bool]:
    has_write = check_permission(current_user, "risks", "write")
    is_owner = risk.owner_id == current_user.id

    if not is_owner:
        check_department_access(risk.department_id, current_user)

    if not has_write and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: risks:write or risk owner required",
        )

    return has_write, is_owner


async def _validate_risk_update_payload(db: AsyncSession, risk: Risk, update_data: dict) -> None:
    if "risk_type" in update_data:
        await validate_risk_type(db, update_data["risk_type"])

    if risk.status == RiskStatusEnum.archived.value:
        if "status" in update_data and update_data["status"] != RiskStatusEnum.archived.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reactivate archived risk. Please create a new risk or contact administrator.",
            )


async def _assert_no_pending_risk_delete(db: AsyncSession, risk_id: int) -> None:
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    existing_delete = await db.execute(
        select(ApprovalRequest).where(
            ApprovalRequest.resource_type == ApprovalResourceType.RISK,
            ApprovalRequest.resource_id == risk_id,
            ApprovalRequest.action_type == ApprovalActionType.DELETE,
            ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]),
        )
    )
    if existing_delete.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cannot update risk while deletion is pending approval")


def _build_priority_risk_change_set(risk: Risk, update_data: dict) -> dict:
    changed = {}
    for field, new_val in update_data.items():
        old_val = getattr(risk, field, None)
        if hasattr(new_val, "value"):
            new_val = new_val.value
        if old_val != new_val:
            changed[field] = {"old": old_val, "new": new_val}
    return changed


async def _create_risk_edit_approval_if_required(
    db: AsyncSession,
    *,
    risk: Risk,
    update_data: dict,
    current_user: User,
):
    from fastapi.responses import JSONResponse

    from app.core.approval_helpers import create_approval_request_with_audit
    from app.core.permissions import can_resolve_approvals, has_sensitive_field_changes
    from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus

    if can_resolve_approvals(current_user):
        return None

    old_data = {
        "owner_id": risk.owner_id,
        "department_id": risk.department_id,
        "category": risk.category,
        "is_priority": risk.is_priority,
    }
    has_sensitive, changed = has_sensitive_field_changes("risk", old_data, update_data)
    is_priority_risk_edit = risk.is_priority and bool(update_data)

    if not has_sensitive and not is_priority_risk_edit:
        return None

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

    if is_priority_risk_edit and not has_sensitive:
        changed = _build_priority_risk_change_set(risk, update_data)

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

    await create_approval_request_with_audit(
        db,
        approval=approval,
        actor=current_user,
        department_id=risk.department_id,
    )

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


def _risk_score_change_set(risk: Risk, update_data: dict) -> dict:
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
    return extra_changes


async def _reload_risk_with_relationships(db: AsyncSession, risk_id: int) -> Risk:
    result = await db.execute(
        select(Risk)
        .options(
            selectinload(Risk.department),
            selectinload(Risk.owner),
            selectinload(Risk.kris),
        )
        .where(Risk.id == risk_id)
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
    Non-privileged users changing sensitive fields (owner, department, category, is_priority)
    will trigger an approval request instead of immediate update.
    """

    risk = await _load_risk_or_404(db, risk_id)
    _assert_risk_update_access(risk, current_user)
    update_data = risk_data.model_dump(exclude_unset=True)
    await _validate_risk_update_payload(db, risk, update_data)
    await _assert_no_pending_risk_delete(db, risk.id)
    if "owner_id" in update_data:
        await validate_active_owner_reference(
            db,
            user_id=update_data["owner_id"],
            label="Risk owner",
        )

    approval_response = await _create_risk_edit_approval_if_required(
        db,
        risk=risk,
        update_data=update_data,
        current_user=current_user,
    )
    if approval_response is not None:
        return approval_response

    extra_changes = _risk_score_change_set(risk, update_data)

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
    reloaded_risk = await _reload_risk_with_relationships(db, risk.id)
    now = utc_now()
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return serialize_risk_read(reloaded_risk, monitoring_context)
