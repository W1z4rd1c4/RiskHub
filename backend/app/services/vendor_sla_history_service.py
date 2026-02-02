from __future__ import annotations

from datetime import datetime, UTC, date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vendor_sla import VendorSLA, VendorSLAFrequency
from app.models.vendor_sla_history import VendorSLAValueHistory
from app.services.kri_history_service import KRIHistoryService


class VendorSLAHistoryService:
    @staticmethod
    def _to_frequency(freq: str) -> str:
        # Validate to KRI frequency vocabulary (shared semantics)
        if freq not in {f.value for f in VendorSLAFrequency}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid frequency")
        return freq

    @staticmethod
    def period_bounds_for_date(target_date: date, frequency: str) -> tuple[date, date]:
        frequency = VendorSLAHistoryService._to_frequency(frequency)
        return KRIHistoryService.period_bounds_for_date(target_date, frequency)

    @staticmethod
    def due_date(period_end: date) -> date:
        return KRIHistoryService.due_date(period_end)

    @staticmethod
    async def record_value(
        db: AsyncSession,
        *,
        sla: VendorSLA,
        value: float,
        recorded_by_id: int | None,
        recorded_at: datetime | None = None,
    ) -> VendorSLAValueHistory:
        recorded_at = recorded_at or datetime.now(UTC)
        target_date = recorded_at.date()
        period_start, period_end = VendorSLAHistoryService.period_bounds_for_date(target_date, sla.frequency)

        breach_status = "within"
        if value < sla.lower_limit:
            breach_status = "below"
        elif value > sla.upper_limit:
            breach_status = "above"

        entry = VendorSLAValueHistory(
            sla_id=sla.id,
            period_start=period_start,
            period_end=period_end,
            recorded_at=recorded_at,
            recorded_by_id=recorded_by_id,
            value=value,
            lower_limit=sla.lower_limit,
            upper_limit=sla.upper_limit,
            unit=sla.unit,
            breach_status=breach_status,
        )
        db.add(entry)

        sla.current_value = value
        sla.last_reported_at = recorded_at
        sla.last_period_end = period_end
        db.add(sla)

        await db.flush()
        return entry

    @staticmethod
    async def history(db: AsyncSession, *, sla_id: int, limit: int = 100) -> list[VendorSLAValueHistory]:
        result = await db.execute(
            select(VendorSLAValueHistory)
            .where(VendorSLAValueHistory.sla_id == sla_id)
            .order_by(VendorSLAValueHistory.recorded_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

