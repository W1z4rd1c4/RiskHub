from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, KeyRiskIndicator, Risk
from app.schemas.control import ControlCapabilities, ControlRead
from app.schemas.kri import KRICapabilities, KRIResponse
from app.schemas.risk import RiskCapabilities, RiskRead
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._monitoring_response import (
    load_monitoring_response_context,
    serialize_control_read,
    serialize_kri_response,
    serialize_risk_read,
)


async def serialize_risk_mutation_response(
    db: AsyncSession,
    *,
    risk: Risk,
    now: datetime,
    capabilities: RiskCapabilities,
) -> RiskRead:
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return serialize_risk_read(risk, monitoring_context, capabilities=capabilities)


async def serialize_control_mutation_response(
    db: AsyncSession,
    *,
    control: Control,
    now: datetime,
    capabilities: ControlCapabilities,
) -> ControlRead:
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return serialize_control_read(control, monitoring_context, capabilities=capabilities)


async def serialize_kri_mutation_response(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    now: datetime,
    linked_vendors: list[LinkedVendorRead],
    capabilities: KRICapabilities,
) -> KRIResponse:
    monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
    return serialize_kri_response(
        kri,
        monitoring_context,
        linked_vendors=linked_vendors,
        capabilities=capabilities,
    )
