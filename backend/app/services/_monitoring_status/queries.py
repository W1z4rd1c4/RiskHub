from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import and_, case, exists, false, func, literal, or_, select
from sqlalchemy.sql import Select

from app.models.control import Control
from app.models.control_execution import ControlExecution, ExecutionResult
from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency, kri_breach_condition
from app.services._kri_history.periods import (
    due_date,
    latest_closed_period_for_date,
    never_reported_is_overdue,
    overdue_required_period_end,
    period_bounds_for_date,
)

from .types import ControlMonitoringStatus, KRIMonitoringStatus, KRITimelinessStatus


def _latest_control_execution_subquery():
    ranked = select(
        ControlExecution.control_id.label("control_id"),
        ControlExecution.executed_at.label("executed_at"),
        ControlExecution.result.label("result"),
        func.row_number()
        .over(
            partition_by=ControlExecution.control_id,
            order_by=(ControlExecution.executed_at.desc(), ControlExecution.id.desc()),
        )
        .label("row_num"),
    ).subquery()
    return (
        select(
            ranked.c.control_id,
            ranked.c.executed_at,
            ranked.c.result,
        )
        .where(ranked.c.row_num == 1)
        .subquery()
    )


def apply_control_monitoring_status_filter(
    query: Select,
    *,
    monitoring_status: ControlMonitoringStatus,
    today: date,
    execution_stale_days: int,
) -> Select:
    latest_execution = _latest_control_execution_subquery()
    stale_cutoff = today - timedelta(days=execution_stale_days)
    execution_exists = exists(
        select(literal(1)).select_from(ControlExecution).where(ControlExecution.control_id == Control.id)
    )
    created_recent = func.date(Control.created_at) >= stale_cutoff
    latest_execution_stale = func.date(latest_execution.c.executed_at) < stale_cutoff
    latest_execution_fresh = func.date(latest_execution.c.executed_at) >= stale_cutoff

    if monitoring_status == ControlMonitoringStatus.new:
        predicate = and_(~execution_exists, created_recent)
    elif monitoring_status == ControlMonitoringStatus.needs_review:
        predicate = or_(
            and_(~execution_exists, func.date(Control.created_at) < stale_cutoff),
            and_(latest_execution.c.executed_at.is_not(None), latest_execution_stale),
        )
    elif monitoring_status == ControlMonitoringStatus.failed:
        predicate = and_(
            latest_execution.c.executed_at.is_not(None),
            latest_execution_fresh,
            latest_execution.c.result != ExecutionResult.passed.value,
        )
    else:
        predicate = and_(
            latest_execution.c.executed_at.is_not(None),
            latest_execution_fresh,
            latest_execution.c.result == ExecutionResult.passed.value,
        )

    return query.outerjoin(latest_execution, latest_execution.c.control_id == Control.id).where(predicate)


def _kri_frequency_status_clauses(
    *,
    today: date,
    monitoring_status: KRIMonitoringStatus,
    warning_upper_margin_ratio: float,
) -> list:
    no_history = KeyRiskIndicator.last_period_end.is_(None)
    in_range = and_(
        KeyRiskIndicator.current_value >= KeyRiskIndicator.lower_limit,
        KeyRiskIndicator.current_value <= KeyRiskIndicator.upper_limit,
    )
    upper_above_lower = KeyRiskIndicator.upper_limit > KeyRiskIndicator.lower_limit
    warning_threshold = KeyRiskIndicator.upper_limit - (
        (KeyRiskIndicator.upper_limit - KeyRiskIndicator.lower_limit) * warning_upper_margin_ratio
    )
    warning_condition = and_(upper_above_lower, in_range, KeyRiskIndicator.current_value >= warning_threshold)
    breach_condition = kri_breach_condition()

    clauses = []
    for frequency in KRIFrequency:
        _, required_period_end = latest_closed_period_for_date(today, frequency.value)
        required_due_date = due_date(required_period_end)
        is_frequency = KeyRiskIndicator.frequency == frequency.value
        submitted_for_required_period = and_(
            KeyRiskIndicator.last_period_end.is_not(None),
            KeyRiskIndicator.last_period_end >= required_period_end,
        )
        # not_submitted, HAS-REPORTED rows: use the backtracking overdue anchor (the
        # latest STRICTLY past-due period end, ADR-012 SSOT) so a KRI that missed an
        # EARLIER period is flagged even while the most recent period is still inside
        # its grace window. new/breach/warning/optimal keep the latest-closed-at-today
        # period above -- their behavior is unchanged.
        overdue_period_end = overdue_required_period_end(today, frequency.value)
        reported_but_overdue = and_(
            KeyRiskIndicator.last_period_end.is_not(None),
            KeyRiskIndicator.last_period_end < overdue_period_end,
        )
        # not_submitted, NEVER-REPORTED rows (last_period_end IS NULL): match the DETAIL
        # classifier's today-anchored window via the shared never_reported_is_overdue SSOT
        # -- a never-reported KRI is not_submitted ONLY once its first required period is
        # past due, and stays `new` inside its initial grace window. Gating the no_history
        # clause on this per-frequency boolean is what stops the filter from disagreeing
        # with the detail classifier (and double-counting a row as both new and
        # not_submitted).
        never_reported_overdue = never_reported_is_overdue(today, frequency.value)

        if monitoring_status == KRIMonitoringStatus.new:
            if today <= required_due_date:
                clauses.append(and_(is_frequency, no_history))
        elif monitoring_status == KRIMonitoringStatus.not_submitted:
            missing_overdue_clauses = [reported_but_overdue]
            if never_reported_overdue:
                missing_overdue_clauses.append(no_history)
            clauses.append(and_(is_frequency, or_(*missing_overdue_clauses)))
        elif monitoring_status == KRIMonitoringStatus.breach:
            clauses.append(and_(is_frequency, submitted_for_required_period, breach_condition))
        elif monitoring_status == KRIMonitoringStatus.warning:
            clauses.append(and_(is_frequency, submitted_for_required_period, warning_condition))
        elif monitoring_status == KRIMonitoringStatus.optimal:
            clauses.append(and_(is_frequency, submitted_for_required_period, in_range, ~warning_condition))

    return clauses


def apply_kri_monitoring_status_filter(
    query: Select,
    *,
    monitoring_status: KRIMonitoringStatus,
    today: date,
    warning_upper_margin_ratio: float,
) -> Select:
    clauses = _kri_frequency_status_clauses(
        today=today,
        monitoring_status=monitoring_status,
        warning_upper_margin_ratio=warning_upper_margin_ratio,
    )
    if not clauses:
        return query.where(false())
    return query.where(or_(*clauses))


def kri_monitoring_status_expression(
    *,
    today: date,
    warning_upper_margin_ratio: float,
):
    """Return the canonical SQL monitoring-status value for ordering.

    Keep ordering on the same frequency-aware predicates used by the list
    filters so a sorted register cannot disagree with its serialized status.
    """

    status_cases = []
    for status in KRIMonitoringStatus:
        clauses = _kri_frequency_status_clauses(
            today=today,
            monitoring_status=status,
            warning_upper_margin_ratio=warning_upper_margin_ratio,
        )
        if clauses:
            status_cases.append((or_(*clauses), status.value))
    return case(*status_cases, else_=KRIMonitoringStatus.optimal.value)


def apply_kri_timeliness_status_filter(
    query: Select,
    *,
    timeliness_status: KRITimelinessStatus,
    today: date,
) -> Select:
    if timeliness_status != KRITimelinessStatus.due_soon:
        return query.where(false())

    clauses = []
    for frequency in KRIFrequency:
        _, current_period_end = period_bounds_for_date(today, frequency.value)
        advance_date = current_period_end - timedelta(days=7)
        if not (advance_date <= today < current_period_end):
            continue
        clauses.append(
            and_(
                KeyRiskIndicator.frequency == frequency.value,
                or_(
                    KeyRiskIndicator.last_period_end.is_(None),
                    KeyRiskIndicator.last_period_end < current_period_end,
                ),
            )
        )

    if not clauses:
        return query.where(false())
    return query.where(or_(*clauses))
