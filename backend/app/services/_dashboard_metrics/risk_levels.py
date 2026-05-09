from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models import Risk
from app.models.global_config import build_risk_level_ranges, get_risk_thresholds

RiskLevel = Literal["critical", "high", "medium", "low"]
RiskLevelRanges = Mapping[str, tuple[int, int]]


async def get_configured_risk_level_ranges(db: AsyncSession) -> dict[str, tuple[int, int]]:
    medium, high, critical = await get_risk_thresholds(db)
    return build_risk_level_ranges(medium, high, critical)


def build_risk_level_condition_from_ranges(
    risk_level: str | None,
    ranges: RiskLevelRanges,
) -> ColumnElement[bool] | None:
    if risk_level is None or risk_level not in ranges:
        return None
    min_score, max_score = ranges[risk_level]
    return and_(Risk.net_score >= min_score, Risk.net_score <= max_score)
