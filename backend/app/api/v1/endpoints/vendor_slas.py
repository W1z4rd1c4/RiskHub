from __future__ import annotations

from datetime import datetime, date, UTC, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.permissions import can_read_vendor
from app.core.security import require_permission, check_permission
from app.core.activity_logger import log_activity, build_change_set
from app.db.session import get_db
from app.i18n import t
from app.models import User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.notification import Notification, NotificationType
from app.models.role import Role, RoleType
from app.models.vendor_sla import VendorSLA, VendorSLAFrequency
from app.models.global_config import ConfigDefaults, get_config_float
from app.schemas.vendor_sla import (
    VendorSLARead,
    VendorSLACreate,
    VendorSLAUpdate,
    VendorSLAHistoryResponse,
    VendorSLAValueCreate,
)
from app.api.mappers.vendor_sla import sla_to_read
from app.services.kri_history_service import KRIHistoryService
from app.services.notification_service import NotificationService
from app.services.vendor_sla_history_service import VendorSLAHistoryService

router = APIRouter()


def _breach_status(current_value: float, lower: float, upper: float) -> str:
    if current_value < lower:
        return "below"
    if current_value > upper:
        return "above"
    return "within"


async def _users_by_roles(db: AsyncSession, roles: set[RoleType]) -> list[User]:
    role_names = [r.value for r in roles]
    stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .options(selectinload(User.role))
        .where(User.is_active == True)
        .where(Role.name.in_(role_names))
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def _check_duplicate_notification(
    db: AsyncSession,
    *,
    vendor_id: int,
    notification_type: NotificationType,
    now: datetime,
    lookback_days: int = 7,
) -> bool:
    cutoff_date = (now - timedelta(days=lookback_days)).replace(tzinfo=None)
    stmt = (
        select(Notification)
        .where(
            and_(
                Notification.resource_type == "vendor",
                Notification.resource_id == vendor_id,
                Notification.type == notification_type,
                Notification.created_at >= cutoff_date,
            )
        )
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def _get_sla_or_404(db: AsyncSession, sla_id: int) -> VendorSLA:
    result = await db.execute(
        select(VendorSLA)
        .options(selectinload(VendorSLA.vendor), selectinload(VendorSLA.reporting_owner))
        .where(VendorSLA.id == sla_id)
    )
    sla = result.scalar_one_or_none()
    if not sla:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    return sla


def _can_read_sla(sla: VendorSLA, current_user: User) -> bool:
    if sla.reporting_owner_id and sla.reporting_owner_id == current_user.id:
        return True
    if sla.vendor and can_read_vendor(sla.vendor, current_user):
        return True
    return False


def _can_write_sla(sla: VendorSLA, current_user: User) -> bool:
    if check_permission(current_user, "vendors", "write"):
        return True
    if sla.reporting_owner_id and sla.reporting_owner_id == current_user.id:
        return True
    if sla.vendor and sla.vendor.outsourcing_owner_user_id == current_user.id:
        return True
    return False


@router.get("/vendor-slas", response_model=list[VendorSLARead])
async def list_vendor_slas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    vendor_id: int | None = None,
    include_archived: bool = False,
):
    if not check_permission(current_user, "vendors", "read"):
        return []

    stmt = select(VendorSLA).options(selectinload(VendorSLA.vendor), selectinload(VendorSLA.reporting_owner))
    if not include_archived:
        stmt = stmt.where(VendorSLA.is_archived == False)
    if vendor_id is not None:
        stmt = stmt.where(VendorSLA.vendor_id == vendor_id)
    stmt = stmt.order_by(desc(VendorSLA.last_updated))

    slas = (await db.execute(stmt)).scalars().all()
    visible = [s for s in slas if _can_read_sla(s, current_user)]
    return [sla_to_read(s) for s in visible]


@router.post("/vendor-slas", response_model=VendorSLARead, status_code=status.HTTP_201_CREATED)
async def create_vendor_sla(
    payload: VendorSLACreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = (await db.execute(select(Vendor).where(Vendor.id == payload.vendor_id))).scalar_one_or_none()
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    can_vendor_write = check_permission(current_user, "vendors", "write")
    is_vendor_owner = vendor.outsourcing_owner_user_id == current_user.id
    is_reporting_owner = payload.reporting_owner_id == current_user.id if payload.reporting_owner_id is not None else False
    if not (can_vendor_write or is_vendor_owner or is_reporting_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    sla = VendorSLA(
        vendor_id=payload.vendor_id,
        metric_name=payload.metric_name,
        description=payload.description,
        current_value=payload.current_value,
        lower_limit=payload.lower_limit,
        upper_limit=payload.upper_limit,
        unit=payload.unit,
        frequency=payload.frequency.value,
        reporting_owner_id=payload.reporting_owner_id,
    )
    db.add(sla)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_SLA,
        entity_id=sla.id,
        entity_name=f"{vendor.name} SLA",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=vendor.department_id,
        description=f"Created vendor SLA for {vendor.name}",
    )
    await db.commit()
    await db.refresh(sla)
    return sla_to_read(sla)


@router.get("/vendor-slas/{sla_id}", response_model=VendorSLARead)
async def get_vendor_sla(
    sla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    sla = await _get_sla_or_404(db, sla_id)
    if not _can_read_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    return sla_to_read(sla)


@router.put("/vendor-slas/{sla_id}", response_model=VendorSLARead)
async def update_vendor_sla(
    sla_id: int,
    payload: VendorSLAUpdate,
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

    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    changes = build_change_set(sla, updates)
    for field, value in updates.items():
        if value is None:
            setattr(sla, field, None)
            continue
        if hasattr(value, "value"):
            value = value.value
        setattr(sla, field, value)

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_SLA,
        entity_id=sla.id,
        entity_name=f"{sla.vendor.name} SLA" if sla.vendor else "Vendor SLA",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=sla.vendor.department_id if sla.vendor else None,
        changes=changes,
    )

    await db.commit()
    await db.refresh(sla)
    return sla_to_read(sla)


@router.delete("/vendor-slas/{sla_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_vendor_sla(
    sla_id: int,
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

    changes = build_change_set(sla, {"is_archived": True})
    sla.is_archived = True
    sla.archived_at = datetime.now(UTC)
    sla.archived_by_id = current_user.id

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_SLA,
        entity_id=sla.id,
        entity_name=f"{sla.vendor.name} SLA" if sla.vendor else "Vendor SLA",
        action=ActivityAction.ARCHIVE,
        actor=current_user,
        department_id=sla.vendor.department_id if sla.vendor else None,
        changes=changes,
        description="Archived vendor SLA",
    )
    await db.commit()
    return None


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

    await VendorSLAHistoryService.record_value(
        db,
        sla=sla,
        value=payload.value,
        recorded_by_id=current_user.id,
        recorded_at=payload.recorded_at,
    )

    now = payload.recorded_at or datetime.now(UTC)
    vendor = sla.vendor
    if vendor:
        breach = sla.breach_status
        if breach in ("above", "below"):
            if not await _check_duplicate_notification(
                db, vendor_id=vendor.id, notification_type=NotificationType.VENDOR_SLA_BREACH_DETECTED, now=now
            ):
                recipients: list[User] = []
                if sla.reporting_owner_id:
                    owner = (await db.execute(select(User).where(User.id == sla.reporting_owner_id))).scalar_one_or_none()
                    if owner:
                        recipients.append(owner)
                if vendor.outsourcing_owner_user_id and vendor.outsourcing_owner_user_id not in {u.id for u in recipients}:
                    v_owner = (
                        await db.execute(select(User).where(User.id == vendor.outsourcing_owner_user_id))
                    ).scalar_one_or_none()
                    if v_owner:
                        recipients.append(v_owner)
                recipients.extend(await _users_by_roles(db, {RoleType.RISK_MANAGER, RoleType.COMPLIANCE}))

                for u in {u.id: u for u in recipients}.values():
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
                            u = (await db.execute(select(User).where(User.id == recipient_id))).scalar_one_or_none()
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


@router.get("/vendor-slas/{sla_id}/history", response_model=VendorSLAHistoryResponse)
async def get_vendor_sla_history(
    sla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    limit: int = Query(100, ge=1, le=500),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    sla = await _get_sla_or_404(db, sla_id)
    if not _can_read_sla(sla, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor SLA not found")
    items = await VendorSLAHistoryService.history(db, sla_id=sla_id, limit=limit)
    return VendorSLAHistoryResponse(sla_id=sla_id, items=items)


def _is_due_soon(*, due: date, today: date) -> bool:
    return today <= due <= (today + timedelta(days=7))


@router.get("/vendor-slas/due-soon", response_model=list[VendorSLARead])
async def vendor_slas_due_soon(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
    vendor_id: int | None = None,
):
    stmt = select(VendorSLA).where(VendorSLA.is_archived == False).options(selectinload(VendorSLA.vendor))
    if vendor_id is not None:
        stmt = stmt.where(VendorSLA.vendor_id == vendor_id)
    slas = (await db.execute(stmt)).scalars().all()
    today = date.today()
    due_soon = []
    for sla in slas:
        if not _can_read_sla(sla, current_user):
            continue
        _, current_period_end = KRIHistoryService.period_bounds_for_date(today, sla.frequency)
        _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, sla.frequency)
        period_end = current_period_end if (sla.last_period_end and sla.last_period_end >= latest_closed_end) else latest_closed_end
        due = VendorSLAHistoryService.due_date(period_end)
        if _is_due_soon(due=due, today=today):
            due_soon.append(sla_to_read(sla))
    return due_soon


@router.get("/vendor-slas/overdue", response_model=list[VendorSLARead])
async def vendor_slas_overdue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
    vendor_id: int | None = None,
):
    stmt = select(VendorSLA).where(VendorSLA.is_archived == False).options(selectinload(VendorSLA.vendor))
    if vendor_id is not None:
        stmt = stmt.where(VendorSLA.vendor_id == vendor_id)
    slas = (await db.execute(stmt)).scalars().all()
    today = date.today()
    overdue = []
    for sla in slas:
        if not _can_read_sla(sla, current_user):
            continue
        _, current_period_end = KRIHistoryService.period_bounds_for_date(today, sla.frequency)
        _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(today, sla.frequency)
        period_end = current_period_end if (sla.last_period_end and sla.last_period_end >= latest_closed_end) else latest_closed_end
        due = VendorSLAHistoryService.due_date(period_end)
        if due < today:
            overdue.append(sla_to_read(sla))
    return overdue
