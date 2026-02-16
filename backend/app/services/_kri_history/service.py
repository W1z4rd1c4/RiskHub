from __future__ import annotations

from datetime import datetime
from typing import Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.kri_history import KRIValueHistory

from . import clock
from .corrections import apply_history_correction as _apply_history_correction
from .periods import (
    _end_of_month as _end_of_month,
)
from .periods import (
    current_period,
    due_date,
    frequency_to_days,
    is_period_end_boundary,
    is_within_reporting_window,
    latest_closed_period_for_date,
    period_bounds_for_date,
    reporting_owner_id,
)
from .queries import get_due_soon_kris as _get_due_soon_kris
from .queries import get_history as _get_history
from .queries import get_overdue_kris as _get_overdue_kris
from .recording import record_value as _record_value


class KRIHistoryService:
    """Service for managing KRI value recording with period boundaries."""

    _end_of_month = staticmethod(_end_of_month)

    period_bounds_for_date = staticmethod(period_bounds_for_date)
    latest_closed_period_for_date = staticmethod(latest_closed_period_for_date)
    is_period_end_boundary = staticmethod(is_period_end_boundary)
    frequency_to_days = staticmethod(frequency_to_days)
    current_period = staticmethod(current_period)
    due_date = staticmethod(due_date)
    reporting_owner_id = staticmethod(reporting_owner_id)
    is_within_reporting_window = staticmethod(is_within_reporting_window)

    @staticmethod
    async def record_value(
        db: AsyncSession,
        kri: KeyRiskIndicator,
        value: float,
        recorded_by_id: Optional[int] = None,
        recorded_at: Optional[datetime] = None,
        period_end: Optional[clock.date] = None,
        is_privileged: bool = False,
        allow_open_period: bool = False,
    ) -> KRIValueHistory:
        return await _record_value(
            db=db,
            kri=kri,
            value=value,
            recorded_by_id=recorded_by_id,
            recorded_at=recorded_at,
            period_end=period_end,
            is_privileged=is_privileged,
            allow_open_period=allow_open_period,
        )

    @staticmethod
    async def get_history(
        db: AsyncSession,
        kri_id: int,
        from_date: Optional[clock.date] = None,
        to_date: Optional[clock.date] = None,
        page: int = 1,
        size: int = 20,
    ) -> Tuple[list[KRIValueHistory], int]:
        return await _get_history(
            db=db,
            kri_id=kri_id,
            from_date=from_date,
            to_date=to_date,
            page=page,
            size=size,
        )

    @staticmethod
    async def get_overdue_kris(
        db: AsyncSession,
    ) -> list[dict]:
        return await _get_overdue_kris(db)

    @staticmethod
    async def get_due_soon_kris(
        db: AsyncSession,
    ) -> list[dict]:
        return await _get_due_soon_kris(db)

    @staticmethod
    async def apply_history_correction(
        db: AsyncSession,
        entry_id: int,
        new_value: float,
        corrected_by_id: Optional[int] = None,
    ) -> KRIValueHistory:
        return await _apply_history_correction(
            db=db,
            entry_id=entry_id,
            new_value=new_value,
            corrected_by_id=corrected_by_id,
        )
