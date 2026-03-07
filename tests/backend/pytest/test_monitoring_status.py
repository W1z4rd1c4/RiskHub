from datetime import UTC, date, datetime, timedelta

import pytest

from app.models.global_config import ConfigDefaults, GlobalConfig
from app.models.global_config import clear_config_cache
from app.services._monitoring_status import (
    ControlMonitoringConfig,
    ControlMonitoringFacts,
    ControlMonitoringStatus,
    KRIMonitoringConfig,
    KRIMonitoringFacts,
    KRIMonitoringStatus,
    derive_control_monitoring_snapshot,
    derive_kri_monitoring_snapshot,
    get_control_monitoring_config,
    get_kri_monitoring_config,
    is_within_upper_warning_margin,
)


def _utc_datetime(year: int, month: int, day: int) -> datetime:
    return datetime(year, month, day, tzinfo=UTC)


@pytest.fixture(autouse=True)
def clear_monitoring_config_cache():
    clear_config_cache()
    yield
    clear_config_cache()


def test_control_monitoring_new_when_no_execution_logs_recent():
    snapshot = derive_control_monitoring_snapshot(
        ControlMonitoringFacts(
            created_at=_utc_datetime(2026, 1, 15),
            latest_execution_result=None,
            latest_executed_at=None,
            execution_log_count=0,
        ),
        ControlMonitoringConfig(execution_stale_days=365),
        now=_utc_datetime(2026, 3, 7),
    )

    assert snapshot.monitoring_status == ControlMonitoringStatus.new
    assert snapshot.execution_log_count == 0
    assert snapshot.days_since_last_execution is None


def test_control_monitoring_needs_review_when_no_execution_logs_stale():
    snapshot = derive_control_monitoring_snapshot(
        ControlMonitoringFacts(
            created_at=_utc_datetime(2024, 1, 1),
            latest_execution_result=None,
            latest_executed_at=None,
            execution_log_count=0,
        ),
        ControlMonitoringConfig(execution_stale_days=365),
        now=_utc_datetime(2026, 3, 7),
    )

    assert snapshot.monitoring_status == ControlMonitoringStatus.needs_review
    assert snapshot.days_since_last_execution is None


@pytest.mark.parametrize("latest_result", ["failed", "warning", "not_applicable"])
def test_control_monitoring_failed_for_latest_non_passed_result(latest_result: str):
    snapshot = derive_control_monitoring_snapshot(
        ControlMonitoringFacts(
            created_at=_utc_datetime(2025, 1, 1),
            latest_execution_result=latest_result,
            latest_executed_at=_utc_datetime(2026, 3, 1),
            execution_log_count=3,
        ),
        ControlMonitoringConfig(execution_stale_days=365),
        now=_utc_datetime(2026, 3, 7),
    )

    assert snapshot.monitoring_status == ControlMonitoringStatus.failed
    assert snapshot.latest_execution_result == latest_result
    assert snapshot.days_since_last_execution == 6


def test_control_monitoring_passed_for_latest_passed_result():
    snapshot = derive_control_monitoring_snapshot(
        ControlMonitoringFacts(
            created_at=_utc_datetime(2025, 1, 1),
            latest_execution_result="passed",
            latest_executed_at=_utc_datetime(2026, 3, 1),
            execution_log_count=2,
        ),
        ControlMonitoringConfig(execution_stale_days=365),
        now=_utc_datetime(2026, 3, 7),
    )

    assert snapshot.monitoring_status == ControlMonitoringStatus.passed
    assert snapshot.days_since_last_execution == 6


def test_control_monitoring_needs_review_when_latest_execution_is_stale():
    snapshot = derive_control_monitoring_snapshot(
        ControlMonitoringFacts(
            created_at=_utc_datetime(2025, 1, 1),
            latest_execution_result="passed",
            latest_executed_at=_utc_datetime(2025, 1, 1),
            execution_log_count=1,
        ),
        ControlMonitoringConfig(execution_stale_days=365),
        now=_utc_datetime(2026, 3, 7),
    )

    assert snapshot.monitoring_status == ControlMonitoringStatus.needs_review
    assert snapshot.days_since_last_execution == 430


def test_control_monitoring_uses_latest_execution_only():
    snapshot = derive_control_monitoring_snapshot(
        ControlMonitoringFacts(
            created_at=_utc_datetime(2025, 1, 1),
            latest_execution_result="passed",
            latest_executed_at=_utc_datetime(2026, 3, 6),
            execution_log_count=4,
        ),
        ControlMonitoringConfig(execution_stale_days=365),
        now=_utc_datetime(2026, 3, 7),
    )

    assert snapshot.monitoring_status == ControlMonitoringStatus.passed


def test_kri_monitoring_new_when_no_submission_history_and_not_overdue():
    snapshot = derive_kri_monitoring_snapshot(
        KRIMonitoringFacts(
            current_value=5.0,
            lower_limit=0.0,
            upper_limit=10.0,
            breach_status="within",
            frequency="monthly",
            last_period_end=None,
            has_submission_history=False,
        ),
        KRIMonitoringConfig(warning_upper_margin_ratio=0.10),
        today=date(2026, 3, 7),
    )

    assert snapshot.monitoring_status == KRIMonitoringStatus.new
    assert snapshot.days_overdue == 0
    assert snapshot.is_submitted_for_required_period is False


def test_kri_monitoring_not_submitted_when_required_period_missing_after_due_date():
    snapshot = derive_kri_monitoring_snapshot(
        KRIMonitoringFacts(
            current_value=5.0,
            lower_limit=0.0,
            upper_limit=10.0,
            breach_status="within",
            frequency="monthly",
            last_period_end=date(2026, 1, 31),
            has_submission_history=True,
        ),
        KRIMonitoringConfig(warning_upper_margin_ratio=0.10),
        today=date(2026, 3, 20),
    )

    assert snapshot.monitoring_status == KRIMonitoringStatus.not_submitted
    assert snapshot.days_overdue == 5
    assert snapshot.is_submitted_for_required_period is False


def test_kri_monitoring_breach_when_required_period_value_outside_limits():
    snapshot = derive_kri_monitoring_snapshot(
        KRIMonitoringFacts(
            current_value=12.0,
            lower_limit=0.0,
            upper_limit=10.0,
            breach_status="above",
            frequency="monthly",
            last_period_end=date(2026, 2, 28),
            has_submission_history=True,
        ),
        KRIMonitoringConfig(warning_upper_margin_ratio=0.10),
        today=date(2026, 3, 7),
    )

    assert snapshot.monitoring_status == KRIMonitoringStatus.breach
    assert snapshot.is_submitted_for_required_period is True


def test_kri_monitoring_warning_only_near_upper_limit():
    snapshot = derive_kri_monitoring_snapshot(
        KRIMonitoringFacts(
            current_value=9.2,
            lower_limit=0.0,
            upper_limit=10.0,
            breach_status="within",
            frequency="monthly",
            last_period_end=date(2026, 2, 28),
            has_submission_history=True,
        ),
        KRIMonitoringConfig(warning_upper_margin_ratio=0.10),
        today=date(2026, 3, 7),
    )

    assert snapshot.monitoring_status == KRIMonitoringStatus.warning


def test_kri_monitoring_optimal_when_within_limits_and_not_near_upper_limit():
    snapshot = derive_kri_monitoring_snapshot(
        KRIMonitoringFacts(
            current_value=5.0,
            lower_limit=0.0,
            upper_limit=10.0,
            breach_status="within",
            frequency="monthly",
            last_period_end=date(2026, 2, 28),
            has_submission_history=True,
        ),
        KRIMonitoringConfig(warning_upper_margin_ratio=0.10),
        today=date(2026, 3, 7),
    )

    assert snapshot.monitoring_status == KRIMonitoringStatus.optimal


def test_kri_upper_warning_margin_ignores_lower_boundary_proximity():
    assert is_within_upper_warning_margin(
        current_value=0.8,
        lower_limit=0.0,
        upper_limit=10.0,
        warning_upper_margin_ratio=0.10,
    ) is False


@pytest.mark.asyncio
async def test_monitoring_config_helpers_use_defaults_when_missing(db_session):
    control_config = await get_control_monitoring_config(db_session)
    kri_config = await get_kri_monitoring_config(db_session)

    assert control_config.execution_stale_days == ConfigDefaults.CONTROL_EXECUTION_STALE_DAYS
    assert kri_config.warning_upper_margin_ratio == ConfigDefaults.KRI_WARNING_UPPER_MARGIN_RATIO


@pytest.mark.asyncio
async def test_monitoring_config_helpers_respect_db_overrides(db_session):
    db_session.add_all(
        [
            GlobalConfig(
                key="control_execution_stale_days",
                value="730",
                value_type="int",
                category="monitoring",
                display_name="Control Execution Stale Days",
            ),
            GlobalConfig(
                key="kri_warning_upper_margin_ratio",
                value="0.25",
                value_type="string",
                category="monitoring",
                display_name="KRI Warning Upper Margin Ratio",
            ),
        ]
    )
    await db_session.commit()
    clear_config_cache()

    control_config = await get_control_monitoring_config(db_session)
    kri_config = await get_kri_monitoring_config(db_session)

    assert control_config.execution_stale_days == 730
    assert kri_config.warning_upper_margin_ratio == 0.25


@pytest.mark.asyncio
async def test_monitoring_config_helpers_clamp_invalid_values(db_session):
    db_session.add_all(
        [
            GlobalConfig(
                key="control_execution_stale_days",
                value="-5",
                value_type="int",
                category="monitoring",
                display_name="Control Execution Stale Days",
            ),
            GlobalConfig(
                key="kri_warning_upper_margin_ratio",
                value="3.0",
                value_type="string",
                category="monitoring",
                display_name="KRI Warning Upper Margin Ratio",
            ),
        ]
    )
    await db_session.commit()
    clear_config_cache()

    control_config = await get_control_monitoring_config(db_session)
    kri_config = await get_kri_monitoring_config(db_session)

    assert control_config.execution_stale_days == 0
    assert kri_config.warning_upper_margin_ratio == 1.0
