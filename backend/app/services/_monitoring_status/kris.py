from __future__ import annotations

from datetime import date

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm.attributes import NO_VALUE

from app.models.key_risk_indicator import KeyRiskIndicator
from app.services._kri_history.periods import due_date, latest_closed_period_for_date

from .types import (
    KRIMonitoringConfig,
    KRIMonitoringFacts,
    KRIMonitoringReason,
    KRIMonitoringSnapshot,
    KRIMonitoringStatus,
)


def classify_kri_breach(*, current_value: float, lower_limit: float, upper_limit: float) -> str:
    if current_value < lower_limit:
        return "below"
    if current_value > upper_limit:
        return "above"
    return "within"


def build_kri_monitoring_facts(kri: KeyRiskIndicator) -> KRIMonitoringFacts:
    history_entries_attr = sa_inspect(kri).attrs.history_entries.loaded_value
    history_entries = [] if history_entries_attr is NO_VALUE else list(history_entries_attr or [])
    has_submission_history = bool(kri.last_period_end) or bool(history_entries)
    return KRIMonitoringFacts(
        current_value=kri.current_value,
        lower_limit=kri.lower_limit,
        upper_limit=kri.upper_limit,
        breach_status=classify_kri_breach(
            current_value=kri.current_value,
            lower_limit=kri.lower_limit,
            upper_limit=kri.upper_limit,
        ),
        frequency=kri.frequency,
        last_period_end=kri.last_period_end,
        has_submission_history=has_submission_history,
    )


def is_within_upper_warning_margin(
    *,
    current_value: float,
    lower_limit: float,
    upper_limit: float,
    warning_upper_margin_ratio: float,
) -> bool:
    if upper_limit <= lower_limit:
        return False
    if current_value < lower_limit or current_value > upper_limit:
        return False
    warning_distance = (upper_limit - lower_limit) * warning_upper_margin_ratio
    return (upper_limit - current_value) <= warning_distance


def derive_kri_monitoring_snapshot(
    facts: KRIMonitoringFacts,
    config: KRIMonitoringConfig,
    *,
    today: date,
) -> KRIMonitoringSnapshot:
    _, required_period_end = latest_closed_period_for_date(today, facts.frequency)
    required_due_date = due_date(required_period_end)
    is_submitted_for_required_period = (
        facts.last_period_end is not None and facts.last_period_end >= required_period_end
    )
    days_overdue = 0
    if today > required_due_date and not is_submitted_for_required_period:
        days_overdue = max((today - required_due_date).days, 0)

    if not facts.has_submission_history and days_overdue == 0:
        return KRIMonitoringSnapshot(
            monitoring_status=KRIMonitoringStatus.new,
            monitoring_status_reason=KRIMonitoringReason.no_submission_history_within_window,
            is_submitted_for_required_period=False,
            required_period_end=required_period_end,
            required_due_date=required_due_date,
            days_overdue=0,
            warning_upper_margin_ratio=config.warning_upper_margin_ratio,
        )

    if days_overdue > 0:
        return KRIMonitoringSnapshot(
            monitoring_status=KRIMonitoringStatus.not_submitted,
            monitoring_status_reason=KRIMonitoringReason.required_period_missing_submission,
            is_submitted_for_required_period=False,
            required_period_end=required_period_end,
            required_due_date=required_due_date,
            days_overdue=days_overdue,
            warning_upper_margin_ratio=config.warning_upper_margin_ratio,
        )

    if facts.breach_status != "within":
        return KRIMonitoringSnapshot(
            monitoring_status=KRIMonitoringStatus.breach,
            monitoring_status_reason=KRIMonitoringReason.latest_measurement_breach,
            is_submitted_for_required_period=is_submitted_for_required_period,
            required_period_end=required_period_end,
            required_due_date=required_due_date,
            days_overdue=0,
            warning_upper_margin_ratio=config.warning_upper_margin_ratio,
        )

    if is_within_upper_warning_margin(
        current_value=facts.current_value,
        lower_limit=facts.lower_limit,
        upper_limit=facts.upper_limit,
        warning_upper_margin_ratio=config.warning_upper_margin_ratio,
    ):
        return KRIMonitoringSnapshot(
            monitoring_status=KRIMonitoringStatus.warning,
            monitoring_status_reason=KRIMonitoringReason.latest_measurement_warning_upper_margin,
            is_submitted_for_required_period=is_submitted_for_required_period,
            required_period_end=required_period_end,
            required_due_date=required_due_date,
            days_overdue=0,
            warning_upper_margin_ratio=config.warning_upper_margin_ratio,
        )

    return KRIMonitoringSnapshot(
        monitoring_status=KRIMonitoringStatus.optimal,
        monitoring_status_reason=KRIMonitoringReason.latest_measurement_optimal,
        is_submitted_for_required_period=is_submitted_for_required_period,
        required_period_end=required_period_end,
        required_due_date=required_due_date,
        days_overdue=0,
        warning_upper_margin_ratio=config.warning_upper_margin_ratio,
    )
