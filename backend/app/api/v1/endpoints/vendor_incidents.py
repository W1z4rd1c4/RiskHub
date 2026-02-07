from __future__ import annotations

from datetime import datetime, UTC, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import require_permission, check_permission
from app.core.activity_logger import log_activity, build_change_set
from app.db.session import get_db
from app.i18n import t
from app.models import User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.notification import NotificationType
from app.models.role import Role, RoleType, RolePermission
from app.models.vendor_incident import VendorIncident, VendorIncidentType, VendorIncidentSeverity
from app.models.vendor_remediation import VendorRemediationAction, VendorRemediationStatus
from app.schemas.vendor_incident import (
    VendorIncidentRead,
    VendorIncidentCreate,
    VendorIncidentUpdate,
    VendorRemediationRead,
    VendorRemediationCreate,
    VendorRemediationUpdate,
)
from app.services.notification_service import NotificationService

router = APIRouter()


async def _get_vendor_or_404(db: AsyncSession, vendor_id: int, current_user: User) -> Vendor:
    vendor = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


def _require_vendor_write(vendor: Vendor, current_user: User) -> None:
    can_write = check_permission(current_user, "vendors", "write")
    if can_write:
        return
    if is_vendor_owner(vendor, current_user):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:write")


async def _users_by_roles(db: AsyncSession, roles: set[RoleType]) -> list[User]:
    role_names = [r.value for r in roles]
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .options(permission_load)
        .where(User.is_active == True)
        .where(Role.name.in_(role_names))
    )
    result = await db.execute(stmt)
    return result.scalars().all()


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
        now = datetime.now(UTC)
        recently_triggered = (
            vendor.reassessment_triggered_reason == "major_incident"
            and vendor.reassessment_triggered_at
            and (vendor.reassessment_triggered_at.replace(tzinfo=UTC) >= (now - timedelta(hours=6)))
        )
        if not recently_triggered:
            vendor.next_reassessment_due_at = now
            vendor.reassessment_triggered_reason = "major_incident"
            vendor.reassessment_triggered_at = now

            # Notify outsourcing owner + Risk Manager/Compliance (re-use reassessment notification type)
            owner_id = vendor.outsourcing_owner_user_id
            if owner_id:
                permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
                owner = (await db.execute(select(User).options(permission_load).where(User.id == owner_id))).scalar_one_or_none()
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


@router.get("/vendors/{vendor_id}/remediation", response_model=list[VendorRemediationRead])
async def list_vendor_remediation(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    await _get_vendor_or_404(db, vendor_id, current_user)
    result = await db.execute(
        select(VendorRemediationAction)
        .where(VendorRemediationAction.vendor_id == vendor_id)
        .order_by(desc(VendorRemediationAction.due_at), desc(VendorRemediationAction.created_at))
    )
    return result.scalars().all()


@router.post("/vendors/{vendor_id}/remediation", response_model=VendorRemediationRead, status_code=status.HTTP_201_CREATED)
async def create_vendor_remediation(
    vendor_id: int,
    payload: VendorRemediationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    _require_vendor_write(vendor, current_user)

    remediation = VendorRemediationAction(
        vendor_id=vendor_id,
        incident_id=payload.incident_id,
        owner_user_id=payload.owner_user_id,
        status=VendorRemediationStatus(payload.status.value),
        due_at=payload.due_at,
        description=payload.description,
    )
    db.add(remediation)
    await db.flush()

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_REMEDIATION,
        entity_id=remediation.id,
        entity_name=f"{vendor.name} remediation",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=vendor.department_id,
        description=f"Created vendor remediation action for {vendor.name}",
    )

    await db.commit()
    await db.refresh(remediation)
    return remediation


@router.patch("/vendor-remediation/{remediation_id}", response_model=VendorRemediationRead)
async def update_vendor_remediation(
    remediation_id: int,
    payload: VendorRemediationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    remediation = (
        await db.execute(select(VendorRemediationAction).where(VendorRemediationAction.id == remediation_id))
    ).scalar_one_or_none()
    if not remediation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Remediation not found")

    vendor = await _get_vendor_or_404(db, remediation.vendor_id, current_user)
    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and remediation.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    updates = {field: getattr(payload, field) for field in payload.model_fields_set}
    changes = build_change_set(remediation, updates)
    for field, value in updates.items():
        if field == "status" and value is not None:
            remediation.status = VendorRemediationStatus(value.value)
        else:
            setattr(remediation, field, value)

    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR_REMEDIATION,
        entity_id=remediation.id,
        entity_name=f"{vendor.name} remediation",
        action=ActivityAction.UPDATE,
        actor=current_user,
        department_id=vendor.department_id,
        changes=changes,
    )

    await db.commit()
    await db.refresh(remediation)
    return remediation


@router.delete("/vendor-remediation/{remediation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_remediation(
    remediation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    remediation = (
        await db.execute(select(VendorRemediationAction).where(VendorRemediationAction.id == remediation_id))
    ).scalar_one_or_none()
    if not remediation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Remediation not found")

    vendor = await _get_vendor_or_404(db, remediation.vendor_id, current_user)
    _require_vendor_write(vendor, current_user)
    await db.delete(remediation)
    await db.commit()
    return None
