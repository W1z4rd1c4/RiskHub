from __future__ import annotations

from datetime import UTC, datetime
from typing import Iterable

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm.attributes import NO_VALUE

from app.core.datetime_utils import coerce_utc, utc_now
from app.models.control import Control
from app.models.control_execution import ControlExecution, ExecutionResult

from .types import (
    ControlMonitoringConfig,
    ControlMonitoringFacts,
    ControlMonitoringReason,
    ControlMonitoringSnapshot,
    ControlMonitoringStatus,
)


def _fallback_utc_datetime() -> datetime:
    return datetime.min.replace(tzinfo=UTC)


def _latest_execution(executions: Iterable[ControlExecution]) -> ControlExecution | None:
    latest: ControlExecution | None = None
    latest_at = _fallback_utc_datetime()
    for execution in executions:
        executed_at = coerce_utc(execution.executed_at) or _fallback_utc_datetime()
        if latest is None or executed_at > latest_at:
            latest = execution
            latest_at = executed_at
    return latest


def build_control_monitoring_facts(control: Control) -> ControlMonitoringFacts:
    executions_attr = sa_inspect(control).attrs.executions.loaded_value
    executions = [] if executions_attr is NO_VALUE else list(executions_attr or [])
    latest_execution = _latest_execution(executions)
    return ControlMonitoringFacts(
        created_at=coerce_utc(control.created_at),
        latest_execution_result=latest_execution.result if latest_execution else None,
        latest_executed_at=coerce_utc(latest_execution.executed_at) if latest_execution else None,
        execution_log_count=len(executions),
    )


def _elapsed_days(*, start: datetime | None, end: datetime) -> int | None:
    start_utc = coerce_utc(start)
    if start_utc is None:
        return None
    return max((end.date() - start_utc.date()).days, 0)


def derive_control_monitoring_snapshot(
    facts: ControlMonitoringFacts,
    config: ControlMonitoringConfig,
    *,
    now: datetime | None = None,
) -> ControlMonitoringSnapshot:
    current_time = coerce_utc(now) or utc_now()
    execution_log_count = max(int(facts.execution_log_count), 0)
    latest_executed_at = coerce_utc(facts.latest_executed_at)
    latest_execution_result = facts.latest_execution_result
    has_execution_history = (
        execution_log_count > 0 or latest_executed_at is not None or latest_execution_result is not None
    )
    days_since_last_execution = _elapsed_days(start=latest_executed_at, end=current_time)

    if not has_execution_history:
        control_age_days = _elapsed_days(start=facts.created_at, end=current_time) or 0
        if control_age_days > config.execution_stale_days:
            return ControlMonitoringSnapshot(
                monitoring_status=ControlMonitoringStatus.needs_review,
                monitoring_status_reason=ControlMonitoringReason.no_execution_logs_stale,
                latest_execution_result=None,
                latest_executed_at=None,
                days_since_last_execution=None,
                execution_log_count=0,
            )
        return ControlMonitoringSnapshot(
            monitoring_status=ControlMonitoringStatus.new,
            monitoring_status_reason=ControlMonitoringReason.no_execution_logs_recent,
            latest_execution_result=None,
            latest_executed_at=None,
            days_since_last_execution=None,
            execution_log_count=0,
        )

    if days_since_last_execution is not None and days_since_last_execution > config.execution_stale_days:
        return ControlMonitoringSnapshot(
            monitoring_status=ControlMonitoringStatus.needs_review,
            monitoring_status_reason=ControlMonitoringReason.latest_execution_stale,
            latest_execution_result=latest_execution_result,
            latest_executed_at=latest_executed_at,
            days_since_last_execution=days_since_last_execution,
            execution_log_count=max(execution_log_count, 1),
        )

    if latest_execution_result == ExecutionResult.passed.value:
        return ControlMonitoringSnapshot(
            monitoring_status=ControlMonitoringStatus.passed,
            monitoring_status_reason=ControlMonitoringReason.latest_execution_passed,
            latest_execution_result=latest_execution_result,
            latest_executed_at=latest_executed_at,
            days_since_last_execution=days_since_last_execution,
            execution_log_count=max(execution_log_count, 1),
        )

    return ControlMonitoringSnapshot(
        monitoring_status=ControlMonitoringStatus.failed,
        monitoring_status_reason=ControlMonitoringReason.latest_execution_non_passed,
        latest_execution_result=latest_execution_result,
        latest_executed_at=latest_executed_at,
        days_since_last_execution=days_since_last_execution,
        execution_log_count=max(execution_log_count, 1),
    )
