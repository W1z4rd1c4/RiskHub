"""Current register projection; historical replay remains in export definitions."""

from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KeyRiskIndicator
from app.services._monitoring_status import get_kri_monitoring_config
from app.services._monitoring_status.export_rows import apply_kri_monitoring_rows
from app.services._register_listings import effective_kri_lifecycle

from .exports.rows import _kri_to_row


async def build_kri_register_rows(
    *,
    db: AsyncSession,
    models: list[KeyRiskIndicator],
    as_of_date: date,
) -> list[dict[str, Any]]:
    rows = [{**_kri_to_row(kri), "effective_lifecycle": effective_kri_lifecycle(kri)} for kri in models]
    config = await get_kri_monitoring_config(db)
    return apply_kri_monitoring_rows(rows, config=config, as_of_date=as_of_date)
