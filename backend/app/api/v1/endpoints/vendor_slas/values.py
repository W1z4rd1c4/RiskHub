from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.mappers.vendor_sla import sla_to_read
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import can_read_vendor_id
from app.core.security import check_permission
from app.db.session import get_db
from app.i18n import t
from app.models import User
from app.models.global_config import ConfigDefaults, get_config_float
from app.models.notification import NotificationType
from app.models.role import Role, RolePermission, RoleType
from app.schemas.vendor_sla import VendorSLARead, VendorSLAValueCreate
from app.services.notification_service import NotificationService
from app.services.vendor_sla_history_service import VendorSLAHistoryService

from ._shared import (
    _can_read_sla,
    _can_write_sla,
    _check_duplicate_notification,
    _get_sla_or_404,
    _users_by_roles,
)

router = APIRouter()


@router.post("/vendor-slas/{sla_id}/values", response_model=VendorSLARead)
async def record_vendor_sla_value(
    sla_id: int,
    payload: VendorSLAValueCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    sla = await _get_sla_or_404(db, sla_id)
    if not _can_read_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    if not _can_write_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    recorded_at = coerce_utc(payload.recorded_at) if payload.recorded_at else None
    await VendorSLAHistoryService.record_value(
        db,
        sla=sla,
        value=payload.value,
        recorded_by_id=current_user.id,
        recorded_at=recorded_at,
    )

    now = recorded_at or utc_now()
    vendor = sla.vendor
    if vendor:
        permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        breach = sla.breach_status
        if breach in ("above", "below"):
            if not await _check_duplicate_notification(
                db, vendor_id=vendor.id, notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED, now=now
            ):
                recipients: list[User] = []
                if sla.reporting_owner_id:
                    owner = (
                        await db.execute(select(User).options(permission_load).where(User.id == sla.reporting_owner_id))
                    ).scalar_one_or_none()
                    if owner:
                        recipients.append(owner)
                recipient_ids = {u.id for u in recipients}
                if vendor.outsourcing_owner_user_id and vendor.outsourcing_owner_user_id not in recipient_ids:
                    v_owner = (
                        await db.execute(
                            select(User).options(permission_load).where(User.id == vendor.outsourcing_owner_user_id)
                        )
                    ).scalar_one_or_none()
                    if v_owner:
                        recipients.append(v_owner)
                recipients.extend(await _users_by_roles(db, {RoleType.RISK_MANAGER, RoleType.COMPLIANCE}))

                for u in {u.id: u for u in recipients}.values():
                    if not await can_read_vendor_id(db, u, vendor.id):
                        continue
                    locale = getattr(u, "preferred_language", None) or "en"
                    await NotificationService.create_notification(
                        db=db,
                        user_id=u.id,
                        notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED,
                        title=t("notifications.vendor_sla_breach_detected_title", locale=locale),
                        message=t(
                            "notifications.vendor_sla_breach_detected_message",
                            locale=locale,
                            vendor_name=vendor.name,
                            sla_name=sla.metric_name,
                        ),
                        resource_type="vendor",
                        resource_id=vendor.id,
                        created_at=now,
                    )
        else:
            range_size = sla.upper_limit - sla.lower_limit
            if range_size > 0:
                near_breach_threshold = await get_config_float(
                    db,
                    "near_breach_threshold",
                    ConfigDefaults.NEAR_BREACH_THRESHOLD,
                )
                threshold_value = sla.lower_limit + (range_size * near_breach_threshold)
                if sla.current_value >= threshold_value:
                    if not await _check_duplicate_notification(
                        db, vendor_id=vendor.id, notification_type=NotificationType.VENDOR_SLA_NEAR_BREACH, now=now
                    ):
                        recipient_id = sla.reporting_owner_id or vendor.outsourcing_owner_user_id
                        if recipient_id:
                            u = (
                                await db.execute(select(User).options(permission_load).where(User.id == recipient_id))
                            ).scalar_one_or_none()
                            if u and not await can_read_vendor_id(db, u, vendor.id):
                                u = None
                            if u:
                                locale = getattr(u, "preferred_language", None) or "en"
                                await NotificationService.create_notification(
                                    db=db,
                                    user_id=u.id,
                                    notification_type=NotificationType.VENDOR_SLA_NEAR_BREACH,
                                    title=t("notifications.vendor_sla_near_breach_title", locale=locale),
                                    message=t(
                                        "notifications.vendor_sla_near_breach_message",
                                        locale=locale,
                                        vendor_name=vendor.name,
                                        sla_name=sla.metric_name,
                                    ),
                                    resource_type="vendor",
                                    resource_id=vendor.id,
                                    created_at=now,
                                )

    await db.commit()
    await db.refresh(sla)
    return sla_to_read(sla)
