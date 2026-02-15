from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.i18n import t
from app.models import User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.notification import NotificationType
from app.models.role import Role, RolePermission, RoleType
from app.models.vendor_incident import VendorIncident, VendorIncidentSeverity, VendorIncidentType
from app.schemas.vendor_incident import VendorIncidentCreate, VendorIncidentRead, VendorIncidentUpdate
from app.services.notification_service import NotificationService

from ._shared import _get_vendor_or_404, _require_vendor_write, _users_by_roles

router = APIRouter()


@router.get("/vendors/{vendor_id}/incidents", response_model=list[VendorIncidentRead])
async def list_vendor_incidents(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    await _get_vendor_or_404(db, vendor_id, current_user)
    result = await db.execute(
        select(VendorIncident)
        .where(VendorIncident.vendor_id == vendor_id)
        .order_by(desc(VendorIncident.occurred_at), desc(VendorIncident.created_at))
    )
    return result.scalars().all()


@router.post("/vendors/{vendor_id}/incidents", response_model=VendorIncidentRead, status_code=status.HTTP_201_CREATED)
async def create_vendor_incident(
    vendor_id: int,
    payload: VendorIncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    incident = VendorIncident(
        vendor_id=vendor_id,
        incident_type=VendorIncidentType(payload.incident_type.value),
        severity=VendorIncidentSeverity(payload.severity.value),
        is_major=payload.is_major,
        occurred_at=payload.occurred_at,
        detected_at=payload.detected_at,
        resolved_at=payload.resolved_at,
        summary=payload.summary,
        details=payload.details,
    )
    db.add(incident)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_INCIDENT,
        entity_id=incident.id,
        entity_name=f"{vendor.name} incident",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=vendor.department_id,
        description=f"Created vendor incident for {vendor.name}",
    )

    # Automatic escalation: trigger reassessment on major incident
    if incident.is_major:
        now = utc_now()
        triggered_at = coerce_utc(vendor.reassessment_triggered_at)
        recently_triggered = (
            vendor.reassessment_triggered_reason == "major_incident"
            and triggered_at
            and triggered_at >= (now - timedelta(hours=6))
        )
        if not recently_triggered:
            vendor.next_reassessment_due_at = now
            vendor.reassessment_triggered_reason = "major_incident"
            vendor.reassessment_triggered_at = now

            # Notify outsourcing owner + Risk Manager/Compliance (re-use reassessment notification type)
            owner_id = vendor.outsourcing_owner_user_id
            if owner_id:
                permission_load = (
                    selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
                )
                owner_stmt = select(User).options(permission_load).where(User.id == owner_id)
                owner = (await db.execute(owner_stmt)).scalar_one_or_none()
                if owner:
                    owner_locale = getattr(owner, "preferred_language", None) or "en"
                    await NotificationService.create_vendor_notification_if_visible(
                        db=db,
                        user=owner,
                        vendor_id=vendor.id,
                        notification_type=NotificationType.VENDOR_REASSESSMENT_DUE_SOON,
                        title=t("notifications.vendor_reassessment_due_soon_title", locale=owner_locale),
                        message=t(
                            "notifications.vendor_reassessment_due_soon_message",
                            locale=owner_locale,
                            vendor_name=vendor.name,
                            due_date=now.date().isoformat(),
                        ),
                        created_at=now,
                    )

            for gov in await _users_by_roles(db, {RoleType.RISK_MANAGER, RoleType.COMPLIANCE}):
                if gov.id == owner_id:
                    continue
                gov_locale = getattr(gov, "preferred_language", None) or "en"
                await NotificationService.create_vendor_notification_if_visible(
                    db=db,
                    user=gov,
                    vendor_id=vendor.id,
                    notification_type=NotificationType.VENDOR_REASSESSMENT_DUE_SOON,
                    title=t("notifications.vendor_reassessment_due_soon_title", locale=gov_locale),
                    message=t(
                        "notifications.vendor_reassessment_due_soon_message",
                        locale=gov_locale,
                        vendor_name=vendor.name,
                        due_date=now.date().isoformat(),
                    ),
                    created_at=now,
                )

    await db.commit()
    await db.refresh(incident)
    return incident


@router.patch("/vendor-incidents/{incident_id}", response_model=VendorIncidentRead)
async def update_vendor_incident(
    incident_id: int,
    payload: VendorIncidentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    incident = (await db.execute(select(VendorIncident).where(VendorIncident.id == incident_id))).scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    vendor = await _get_vendor_or_404(db, incident.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    changes = build_change_set(incident, updates)
    for field, value in updates.items():
        if value is None:
            setattr(incident, field, None)
            continue
        if field == "incident_type":
            setattr(incident, field, VendorIncidentType(value.value))
        elif field == "severity":
            setattr(incident, field, VendorIncidentSeverity(value.value))
        else:
            setattr(incident, field, value)

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_INCIDENT,
        entity_id=incident.id,
        entity_name=f"{vendor.name} incident",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=vendor.department_id,
        changes=changes,
    )

    await db.commit()
    await db.refresh(incident)
    return incident


@router.delete("/vendor-incidents/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_incident(
    incident_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    incident = (await db.execute(select(VendorIncident).where(VendorIncident.id == incident_id))).scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    vendor = await _get_vendor_or_404(db, incident.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)
    await db.delete(incident)
    await db.commit()
    return None
