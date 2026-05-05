from datetime import date, datetime

from app.services._monitoring_status import (
    ControlMonitoringFacts,
    KRIMonitoringFacts,
    derive_control_monitoring_snapshot,
    derive_kri_monitoring_snapshot,
)

from .shared import _as_of_datetime


def _datetime_or_none(value: object) -> datetime | None:
    return value if isinstance(value, datetime) else None


def _date_or_none(value: object) -> date | None:
    return value if isinstance(value, date) and not isinstance(value, datetime) else None


def _str_or_none(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _int_value(value: object, default: int = 0) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, (float, str)):
        try:
            return int(value)
        except (TypeError, ValueError):
            return default
    return default


def _float_value(value: object, default: float = 0) -> float:
    if isinstance(value, (int, float, str)):
        try:
            return float(value)
        except (TypeError, ValueError):
            return default
    return default


def _apply_control_monitoring_rows(
    rows: list[dict[str, object]],
    *,
    config,
    as_of_date: date,
) -> list[dict[str, object]]:
    as_of_dt = _as_of_datetime(as_of_date)
    for row in rows:
        snapshot = derive_control_monitoring_snapshot(
            ControlMonitoringFacts(
                created_at=_datetime_or_none(row.get("created_at")),
                latest_execution_result=_str_or_none(row.get("latest_execution_result")),
                latest_executed_at=_datetime_or_none(row.get("latest_executed_at")),
                execution_log_count=_int_value(row.get("execution_log_count")),
            ),
            config,
            now=as_of_dt,
        )
        row["monitoring_status"] = snapshot.monitoring_status.value
        row["monitoring_status_reason"] = snapshot.monitoring_status_reason.value
        row["latest_execution_result"] = snapshot.latest_execution_result
        row["latest_executed_at"] = snapshot.latest_executed_at
        row["days_since_last_execution"] = snapshot.days_since_last_execution
        row["execution_log_count"] = snapshot.execution_log_count
    return rows


def _apply_kri_monitoring_rows(
    rows: list[dict[str, object]],
    *,
    config,
    as_of_date: date,
) -> list[dict[str, object]]:
    for row in rows:
        snapshot = derive_kri_monitoring_snapshot(
            KRIMonitoringFacts(
                current_value=_float_value(row.get("current_value")),
                lower_limit=_float_value(row.get("lower_limit")),
                upper_limit=_float_value(row.get("upper_limit")),
                breach_status=str(row.get("breach_status") or "within"),
                frequency=str(row.get("frequency") or "quarterly"),
                last_period_end=_date_or_none(row.get("last_period_end")),
                has_submission_history=bool(row.get("last_period_end")),
            ),
            config,
            today=as_of_date,
        )
        row["monitoring_status"] = snapshot.monitoring_status.value
        row["monitoring_status_reason"] = snapshot.monitoring_status_reason.value
        row["required_period_end"] = snapshot.required_period_end
        row["required_due_date"] = snapshot.required_due_date
        row["days_overdue"] = snapshot.days_overdue
        row["warning_upper_margin_ratio"] = snapshot.warning_upper_margin_ratio
    return rows
