from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.services._vendor_governance.links import (
    VendorLinkField,
    VendorLinkModel,
    create_vendor_link,
    delete_vendor_link,
    load_monitoring_response_context,
    require_vendor_access,
    serialize_control_brief_for_link,
    serialize_kri_response,
)
from app.core.datetime_utils import utc_now
from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id
from app.models import (
    Control,
    KeyRiskIndicator,
    Risk,
    User,
    VendorControlLink,
    VendorKRILink,
    VendorRiskLink,
)
from app.schemas.control import ControlStatusEnum as ControlReadStatusEnum
from app.schemas.vendor_links import LinkedControlRead, LinkedKRIRead, LinkedRiskRead

VendorLinkKind = Literal["risk", "control", "kri"]


@dataclass(frozen=True)
class VendorLinkTarget:
    kind: VendorLinkKind
    link_model: VendorLinkModel
    entity_field: VendorLinkField
    entity_permission: str
    not_found_detail: str


def vendor_link_target(kind: VendorLinkKind) -> VendorLinkTarget:
    if kind == "risk":
        return VendorLinkTarget(
            kind=kind,
            link_model=VendorRiskLink,
            entity_field="risk_id",
            entity_permission="risks",
            not_found_detail="Risk not found",
        )
    if kind == "control":
        return VendorLinkTarget(
            kind=kind,
            link_model=VendorControlLink,
            entity_field="control_id",
            entity_permission="controls",
            not_found_detail="Control not found",
        )
    return VendorLinkTarget(
        kind=kind,
        link_model=VendorKRILink,
        entity_field="kri_id",
        entity_permission="risks",
        not_found_detail="KRI not found",
    )


async def _can_read_risk(db: AsyncSession, current_user: User, risk_id: int) -> bool:
    return await can_read_risk_id(db, current_user, risk_id)


async def _can_read_control(db: AsyncSession, current_user: User, control: Control) -> bool:
    return await can_read_control_id(db, current_user, control.id)


async def _can_read_kri(db: AsyncSession, current_user: User, kri_id: int) -> bool:
    return await can_read_kri_id(db, current_user, kri_id)


async def _ensure_visible_target(
    db: AsyncSession,
    current_user: User,
    target: VendorLinkTarget,
    entity_id: int,
) -> None:
    if target.kind == "risk":
        result = await db.execute(select(Risk).where(Risk.id == entity_id))
        risk = result.scalar_one_or_none()
        if not risk or not await _can_read_risk(db, current_user, entity_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=target.not_found_detail)
        return

    if target.kind == "control":
        result = await db.execute(
            select(Control).options(selectinload(Control.department)).where(Control.id == entity_id)
        )
        control = result.scalar_one_or_none()
        if not control or not await _can_read_control(db, current_user, control):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=target.not_found_detail)
        return

    result = await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.id == entity_id))
    kri = result.scalar_one_or_none()
    if not kri or not await _can_read_kri(db, current_user, entity_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=target.not_found_detail)


async def list_vendor_linked_risks(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
) -> list[LinkedRiskRead]:
    await require_vendor_access(db, vendor_id, current_user, entity_permission="risks")

    result = await db.execute(
        select(VendorRiskLink)
        .options(selectinload(VendorRiskLink.risk).selectinload(Risk.department))
        .where(VendorRiskLink.vendor_id == vendor_id)
    )
    links = result.scalars().all()

    visible: list[LinkedRiskRead] = []
    for link in links:
        if link.risk and await _can_read_risk(db, current_user, link.risk.id):
            risk = link.risk
            visible.append(
                LinkedRiskRead(
                    id=risk.id,
                    risk_id_code=risk.risk_id_code,
                    name=risk.name,
                    process=risk.process,
                    risk_type=risk.risk_type,
                    category=risk.category,
                    gross_score=risk.gross_score,
                    net_score=risk.net_score,
                    is_priority=risk.is_priority,
                    department_id=risk.department_id,
                    department_name=risk.department.name if getattr(risk, "department", None) else None,
                    status=getattr(risk, "status", None),
                )
            )
    return visible


async def list_vendor_linked_controls(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
) -> list[LinkedControlRead]:
    await require_vendor_access(db, vendor_id, current_user, entity_permission="controls")

    result = await db.execute(
        select(VendorControlLink)
        .options(
            selectinload(VendorControlLink.control).selectinload(Control.department),
            selectinload(VendorControlLink.control).selectinload(Control.executions),
        )
        .where(VendorControlLink.vendor_id == vendor_id)
    )
    links = result.scalars().all()
    now = utc_now()
    context = await load_monitoring_response_context(db, now=now, today=now.astimezone(UTC).date())

    visible: list[LinkedControlRead] = []
    for link in links:
        if link.control and await _can_read_control(db, current_user, link.control):
            control = link.control
            control_brief = serialize_control_brief_for_link(control, context)
            visible.append(
                LinkedControlRead(
                    id=control_brief.id,
                    name=control_brief.name,
                    frequency=control_brief.frequency,
                    risk_level=control_brief.risk_level,
                    department_id=control.department_id,
                    department_name=control.department.name if getattr(control, "department", None) else None,
                    status=ControlReadStatusEnum(control_brief.status.value),
                    monitoring_status=control_brief.monitoring_status,
                    monitoring_status_reason=control_brief.monitoring_status_reason,
                    latest_execution_result=control_brief.latest_execution_result,
                    latest_executed_at=control_brief.latest_executed_at,
                    days_since_last_execution=control_brief.days_since_last_execution,
                    execution_log_count=control_brief.execution_log_count,
                )
            )
    return visible


async def list_vendor_linked_kris(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
) -> list[LinkedKRIRead]:
    await require_vendor_access(db, vendor_id, current_user, entity_permission="risks")

    result = await db.execute(
        select(VendorKRILink)
        .options(
            selectinload(VendorKRILink.kri).selectinload(KeyRiskIndicator.risk).selectinload(Risk.department),
            selectinload(VendorKRILink.kri).selectinload(KeyRiskIndicator.reporting_owner),
        )
        .where(VendorKRILink.vendor_id == vendor_id)
    )
    links = result.scalars().all()
    now = utc_now()
    context = await load_monitoring_response_context(db, now=now, today=now.astimezone(UTC).date())

    visible: list[LinkedKRIRead] = []
    for link in links:
        kri = link.kri
        if kri is None or not await _can_read_kri(db, current_user, kri.id):
            continue
        brief = serialize_kri_response(kri, context)
        visible.append(
            LinkedKRIRead(
                id=brief.id,
                risk_id=brief.risk_id,
                metric_name=brief.metric_name,
                description=brief.description,
                current_value=brief.current_value,
                lower_limit=brief.lower_limit,
                upper_limit=brief.upper_limit,
                unit=brief.unit,
                frequency=brief.frequency.value if hasattr(brief.frequency, "value") else str(brief.frequency),
                monitoring_status=(
                    brief.monitoring_status.value
                    if hasattr(brief.monitoring_status, "value")
                    else (str(brief.monitoring_status) if brief.monitoring_status is not None else None)
                ),
                monitoring_status_reason=(
                    brief.monitoring_status_reason.value
                    if hasattr(brief.monitoring_status_reason, "value")
                    else (str(brief.monitoring_status_reason) if brief.monitoring_status_reason is not None else None)
                ),
                is_submitted_for_required_period=brief.is_submitted_for_required_period,
                required_period_end=brief.required_period_end,
                required_due_date=brief.required_due_date,
                days_overdue=brief.days_overdue,
                warning_upper_margin_ratio=brief.warning_upper_margin_ratio,
                risk_name=brief.risk_name,
                risk_process=brief.risk_process,
                risk_department_name=brief.risk_department_name,
                is_archived=brief.is_archived,
            )
        )
    return visible


async def link_vendor_target(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
    kind: VendorLinkKind,
    entity_id: int,
) -> dict[str, str]:
    target = vendor_link_target(kind)
    await require_vendor_access(
        db,
        vendor_id,
        current_user,
        entity_permission=target.entity_permission,
        require_write=True,
    )
    await _ensure_visible_target(db, current_user, target, entity_id)
    return await create_vendor_link(db, target.link_model, vendor_id, target.entity_field, entity_id)


async def unlink_vendor_target(
    db: AsyncSession,
    *,
    vendor_id: int,
    current_user: User,
    kind: VendorLinkKind,
    entity_id: int,
) -> None:
    target = vendor_link_target(kind)
    await require_vendor_access(
        db,
        vendor_id,
        current_user,
        entity_permission=target.entity_permission,
        require_write=True,
    )
    await _ensure_visible_target(db, current_user, target, entity_id)
    await delete_vendor_link(db, target.link_model, vendor_id, target.entity_field, entity_id)
