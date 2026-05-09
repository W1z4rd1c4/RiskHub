from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.owner_reference_validation import validate_active_owner_reference
from app.core.permissions import check_department_access, is_control_owner
from app.core.security import check_permission
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Control,
    KeyRiskIndicator,
    Risk,
    RiskTypeConfig,
    User,
)
from app.services.kri_vendor_assignment import normalize_vendor_ids, validate_assignable_vendors


def raise_missing_permission(resource: str, action: str) -> None:
    raise AuthorizationError(f"Permission denied: {resource}:{action}")


async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:
    result = await db.execute(
        select(RiskTypeConfig).where(
            RiskTypeConfig.code == risk_type_code,
            RiskTypeConfig.is_active.is_(True),
        )
    )
    if not result.scalar_one_or_none():
        raise ValidationError(
            f"Unknown risk type '{risk_type_code}'. Available types can be viewed in Risk Hub configuration."
        )


async def load_risk_or_404(db: AsyncSession, risk_id: int) -> Risk:
    risk = (await db.execute(select(Risk).where(Risk.id == risk_id))).scalar_one_or_none()
    if risk is None:
        raise NotFoundError("Risk not found")
    return risk


def assert_risk_update_access(risk: Risk, current_user: User) -> tuple[bool, bool]:
    has_write = check_permission(current_user, "risks", "write")
    is_owner = risk.owner_id == current_user.id

    if not is_owner:
        check_department_access(risk.department_id, current_user)

    if not has_write and not is_owner:
        raise AuthorizationError("Permission denied: risks:write or risk owner required")

    return has_write, is_owner


async def validate_risk_update_payload(db: AsyncSession, risk: Risk, update_data: dict) -> None:
    if "risk_type" in update_data:
        await validate_risk_type(db, update_data["risk_type"])

    if risk.is_archived:
        raise ValidationError("Cannot update archived risk. Please restore it before applying changes.")


async def assert_no_pending_delete(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
    detail: str,
) -> None:
    pending = (
        await db.execute(
            select(ApprovalRequest)
            .where(ApprovalRequest.resource_type == resource_type)
            .where(ApprovalRequest.resource_id == resource_id)
            .where(ApprovalRequest.action_type == ApprovalActionType.DELETE)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
    ).scalar_one_or_none()
    if pending is not None:
        raise ConflictError(detail)


async def assert_no_existing_pending_delete_request(
    db: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
    detail: str = "Deletion request already pending",
) -> None:
    existing = (
        await db.execute(
            select(ApprovalRequest)
            .where(ApprovalRequest.resource_type == resource_type)
            .where(ApprovalRequest.resource_id == resource_id)
            .where(ApprovalRequest.action_type == ApprovalActionType.DELETE)
            .where(ApprovalRequest.status.in_([ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED]))
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ValidationError(detail)


async def load_control_or_404(db: AsyncSession, control_id: int) -> Control:
    control = (await db.execute(select(Control).where(Control.id == control_id))).scalar_one_or_none()
    if control is None:
        raise NotFoundError("Control not found")
    return control


async def assert_control_update_access(
    db: AsyncSession,
    *,
    control: Control,
    control_id: int,
    current_user: User,
) -> tuple[bool, bool]:
    has_write = check_permission(current_user, "controls", "write")
    is_owner = await is_control_owner(db, current_user.id, control_id)

    if not has_write and not is_owner:
        raise AuthorizationError("Permission denied: controls:write or control owner required")

    if not is_owner:
        check_department_access(control.department_id, current_user)

    return has_write, is_owner


async def prepare_risk_update(
    db: AsyncSession,
    *,
    risk_id: int,
    update_data: dict,
    current_user: User,
) -> Risk:
    risk = await load_risk_or_404(db, risk_id)
    assert_risk_update_access(risk, current_user)
    await validate_risk_update_payload(db, risk, update_data)
    await assert_no_pending_delete(
        db,
        resource_type=ApprovalResourceType.RISK,
        resource_id=risk.id,
        detail="Cannot update risk while deletion is pending approval",
    )
    if "owner_id" in update_data:
        await validate_active_owner_reference(db, user_id=update_data["owner_id"], label="Risk owner")
    return risk


async def prepare_control_update(
    db: AsyncSession,
    *,
    control_id: int,
    update_data: dict,
    current_user: User,
) -> tuple[Control, bool]:
    control = await load_control_or_404(db, control_id)
    _, is_owner = await assert_control_update_access(
        db,
        control=control,
        control_id=control_id,
        current_user=current_user,
    )
    await assert_no_pending_delete(
        db,
        resource_type=ApprovalResourceType.CONTROL,
        resource_id=control.id,
        detail="Cannot update control while deletion is pending approval",
    )
    if "control_owner_id" in update_data:
        await validate_active_owner_reference(
            db,
            user_id=update_data["control_owner_id"],
            label="Control owner",
        )
    return control, is_owner


async def prepare_kri_update(
    db: AsyncSession,
    *,
    kri_id: int,
    update_data: dict,
    current_user: User,
) -> tuple[KeyRiskIndicator, list[int] | None, list[int]]:
    result = await db.execute(
        select(KeyRiskIndicator)
        .join(Risk)
        .where(KeyRiskIndicator.id == kri_id)
        .options(joinedload(KeyRiskIndicator.risk), selectinload(KeyRiskIndicator.vendor_links))
    )
    kri = result.scalar_one_or_none()
    if kri is None:
        raise NotFoundError("KRI not found")

    check_department_access(kri.risk.department_id, current_user)
    if kri.is_archived:
        raise ConflictError("Cannot update archived KRI")

    requested_vendor_ids = update_data.pop("linked_vendor_ids", None)
    normalized_vendor_ids = normalize_vendor_ids(requested_vendor_ids) if requested_vendor_ids is not None else None
    current_vendor_ids = sorted(link.vendor_id for link in getattr(kri, "vendor_links", []) or [])
    if normalized_vendor_ids is not None:
        await validate_assignable_vendors(db, current_user=current_user, vendor_ids=normalized_vendor_ids)

    if "current_value" in update_data:
        raise ValidationError("Cannot update current_value via PUT. Use POST /kris/{id}/values to record new values.")

    new_lower = update_data.get("lower_limit", kri.lower_limit)
    new_upper = update_data.get("upper_limit", kri.upper_limit)
    if new_lower >= new_upper:
        raise ValidationError("lower_limit must be less than upper_limit")

    await assert_no_pending_delete(
        db,
        resource_type=ApprovalResourceType.KRI,
        resource_id=kri.id,
        detail="Cannot update KRI while deletion is pending approval",
    )
    if "reporting_owner_id" in update_data:
        await validate_active_owner_reference(
            db,
            user_id=update_data["reporting_owner_id"],
            label="Reporting owner",
        )
    return kri, normalized_vendor_ids, current_vendor_ids
