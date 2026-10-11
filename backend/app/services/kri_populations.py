"""Canonical current-view KRI populations (ARCH-12, ADR-005).

SQL clauses expect the caller to join Risk. Row classifiers expect its loaded
parent. Presentation monitoring status is distinct from raw band breach.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import and_, false, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select
from sqlalchemy.sql.elements import ColumnElement

from app.core.permissions import kri_visibility_clause
from app.models.global_config import ConfigDefaults
from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.risk import Risk
from app.models.user import User
from app.services._kri_history.periods import (
    latest_closed_period_for_date,
    never_reported_is_overdue,
    overdue_required_period_end,
    period_bounds_for_date,
)

DUE_SOON_DAYS = ConfigDefaults.ADVANCE_REMINDER_DAYS


@dataclass(frozen=True)
class RiskPopulationState:
    """Loaded or reconstructed parent facts; no persistence or authority grant."""

    is_archived: bool
    status: str


@dataclass(frozen=True)
class KRIPopulationState:
    """Pure row facts for replayed exports, classified by the same ORM rules."""

    is_archived: bool
    risk: RiskPopulationState | None
    frequency: str
    last_period_end: date | None


def live_clause() -> ColumnElement[bool]:
    return and_(KeyRiskIndicator.live(), Risk.live())


def archived_clause() -> ColumnElement[bool]:
    return or_(KeyRiskIndicator.archived(), Risk.archived())


def kri_breach_condition() -> ColumnElement[bool]:
    """Raw measurement breach, independent of lifecycle/reporting precedence."""
    return or_(
        KeyRiskIndicator.current_value < KeyRiskIndicator.lower_limit,
        KeyRiskIndicator.current_value > KeyRiskIndicator.upper_limit,
    )


def breaching_clause() -> ColumnElement[bool]:
    return and_(live_clause(), kri_breach_condition())


def is_live(kri: KeyRiskIndicator | KRIPopulationState) -> bool:
    risk = getattr(kri, "risk", None)
    status = getattr(getattr(risk, "status", None), "value", getattr(risk, "status", None))
    return not bool(kri.is_archived) and risk is not None and not bool(risk.is_archived) and status != "archived"


def classify_kri_breach(*, current_value: float, lower_limit: float, upper_limit: float) -> str:
    if current_value < lower_limit:
        return "below"
    if current_value > upper_limit:
        return "above"
    return "within"


def is_breaching(kri: KeyRiskIndicator) -> bool:
    return (
        is_live(kri)
        and classify_kri_breach(
            current_value=kri.current_value, lower_limit=kri.lower_limit, upper_limit=kri.upper_limit
        )
        != "within"
    )


def overdue_period_end(*, frequency: str, last_period_end: date | None, today: date) -> date | None:
    """Return the missing required period, or None; ADR-012 null-history rule."""
    if last_period_end is None:
        if not never_reported_is_overdue(today, frequency):
            return None
        return latest_closed_period_for_date(today, frequency)[1]
    required = overdue_required_period_end(today, frequency)
    return required if last_period_end < required else None



def _frequency_clause(frequency: KRIFrequency) -> ColumnElement[bool]:
    clause = KeyRiskIndicator.frequency == frequency.value
    if frequency == KRIFrequency.quarterly:
        # ADR-012 period helpers retain a quarterly fallback for legacy values.
        return or_(clause, KeyRiskIndicator.frequency.notin_([item.value for item in KRIFrequency]))
    return clause


def overdue_condition(*, today: date) -> ColumnElement[bool]:
    clauses = []
    for frequency in KRIFrequency:
        missing = [
            and_(
                KeyRiskIndicator.last_period_end.is_not(None),
                KeyRiskIndicator.last_period_end < overdue_required_period_end(today, frequency.value),
            )
        ]
        if never_reported_is_overdue(today, frequency.value):
            missing.append(KeyRiskIndicator.last_period_end.is_(None))
        clauses.append(and_(_frequency_clause(frequency), or_(*missing)))
    return or_(*clauses)


def overdue_clause(*, today: date) -> ColumnElement[bool]:
    return and_(live_clause(), overdue_condition(today=today))


def is_overdue(kri: KeyRiskIndicator | KRIPopulationState, *, today: date) -> bool:
    return (
        is_live(kri)
        and overdue_period_end(frequency=kri.frequency, last_period_end=kri.last_period_end, today=today) is not None
    )


def due_soon_period_end(
    *, frequency: str, last_period_end: date | None, today: date, advance_days: int = DUE_SOON_DAYS
) -> date | None:
    period_end = period_bounds_for_date(today, frequency)[1]
    if last_period_end is not None and last_period_end >= period_end:
        return None
    return period_end if period_end - timedelta(days=advance_days) <= today < period_end else None


def due_soon_condition(*, today: date) -> ColumnElement[bool]:
    clauses = []
    for frequency in KRIFrequency:
        period_end = due_soon_period_end(frequency=frequency.value, last_period_end=None, today=today)
        if period_end is not None:
            clauses.append(
                and_(
                    _frequency_clause(frequency),
                    or_(KeyRiskIndicator.last_period_end.is_(None), KeyRiskIndicator.last_period_end < period_end),
                )
            )
    return or_(*clauses) if clauses else false()


def due_soon_clause(*, today: date) -> ColumnElement[bool]:
    return and_(live_clause(), due_soon_condition(today=today))


def is_due_soon(kri: KeyRiskIndicator | KRIPopulationState, *, today: date) -> bool:
    return (
        is_live(kri)
        and due_soon_period_end(frequency=kri.frequency, last_period_end=kri.last_period_end, today=today) is not None
    )


def reminder_period_end(kri: KeyRiskIndicator, *, today: date) -> date:
    """Reminder cadence preserves configured grace/advance timing; share period selection."""
    current = period_bounds_for_date(today, kri.frequency)[1]
    latest = latest_closed_period_for_date(today, kri.frequency)[1]
    return current if kri.last_period_end and kri.last_period_end >= latest else latest


async def visible_query(query: Select, *, db: AsyncSession, actor: User, department_id: int | None = None) -> Select:
    """Use the register's readable set, then intersect the requested department.

    Owning/reporting on a cross-department Risk is existing read authority, not a
    reason to omit the row from a filtered preview of the same register.
    """
    visibility = await kri_visibility_clause(db, actor)
    if visibility is not None:
        query = query.where(visibility)
    if department_id is not None:
        query = query.where(Risk.department_id == department_id)
    return query
