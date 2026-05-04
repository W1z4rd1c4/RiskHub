from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KeyRiskIndicator
from app.schemas.kri import KRICapabilities, KRIResponse
from app.schemas.vendor_shared import LinkedVendorRead
from app.services._monitoring_response import load_monitoring_response_context, serialize_kri_response


async def serialize_kri_history_response(
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
