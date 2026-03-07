from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum


class ControlMonitoringStatus(str, Enum):
    new = "new"
    needs_review = "needs_review"
    failed = "failed"
    passed = "passed"


class ControlMonitoringReason(str, Enum):
    no_execution_logs_recent = "no_execution_logs_recent"
    no_execution_logs_stale = "no_execution_logs_stale"
    latest_execution_stale = "latest_execution_stale"
    latest_execution_passed = "latest_execution_passed"
    latest_execution_non_passed = "latest_execution_non_passed"


class KRIMonitoringStatus(str, Enum):
    new = "new"
    not_submitted = "not_submitted"
    breach = "breach"
    warning = "warning"
    optimal = "optimal"


class KRITimelinessStatus(str, Enum):
    due_soon = "due_soon"


class KRIMonitoringReason(str, Enum):
    no_submission_history_within_window = "no_submission_history_within_window"
    required_period_missing_submission = "required_period_missing_submission"
    latest_measurement_breach = "latest_measurement_breach"
    latest_measurement_warning_upper_margin = "latest_measurement_warning_upper_margin"
    latest_measurement_optimal = "latest_measurement_optimal"


@dataclass(frozen=True)
class ControlMonitoringConfig:
    execution_stale_days: int


@dataclass(frozen=True)
class KRIMonitoringConfig:
    warning_upper_margin_ratio: float


@dataclass(frozen=True)
class ControlMonitoringFacts:
    created_at: datetime | None
    latest_execution_result: str | None
    latest_executed_at: datetime | None
    execution_log_count: int


@dataclass(frozen=True)
class KRIMonitoringFacts:
    current_value: float
    lower_limit: float
    upper_limit: float
    breach_status: str | None
    frequency: str
    last_period_end: date | None
    has_submission_history: bool


@dataclass(frozen=True)
class ControlMonitoringSnapshot:
    monitoring_status: ControlMonitoringStatus
    monitoring_status_reason: ControlMonitoringReason
    latest_execution_result: str | None
    latest_executed_at: datetime | None
    days_since_last_execution: int | None
    execution_log_count: int


@dataclass(frozen=True)
class KRIMonitoringSnapshot:
    monitoring_status: KRIMonitoringStatus
    monitoring_status_reason: KRIMonitoringReason
    is_submitted_for_required_period: bool
    required_period_end: date
    required_due_date: date
    days_overdue: int
    warning_upper_margin_ratio: float
