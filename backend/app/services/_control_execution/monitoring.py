from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.services._monitoring_response import MonitoringResponseContext, load_monitoring_response_context


async def load_control_execution_monitoring_context(db: AsyncSession) -> MonitoringResponseContext:
    now = utc_now()
    return await load_monitoring_response_context(db, now=now, today=now.date())
