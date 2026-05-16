"""
Tests for global_config usage in critical paths.

Validates that configuration values from global_config affect:
- Risk severity thresholds (is_high_risk_for_approval)
- KRI notification timing (deadline service)
"""

import pytest
from httpx import AsyncClient
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    is_high_risk_for_approval,
    is_high_risk_for_approval_async,
)
from app.models import Department, Risk, User
from app.models.global_config import (
    ConfigDefaults,
    GlobalConfig,
    build_risk_level_ranges,
    clear_config_cache,
    get_config_float,
    get_config_int,
    get_config_value,
)
from app.schemas.risk import RiskBriefForLink, RiskRead, RiskStatusEnum, RiskSummary
from app.services._kri_history.constants import REPORTING_GRACE_DAYS


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear config cache before each test."""
    clear_config_cache()
    yield
    clear_config_cache()


# ============================================================================
# Config Helper Tests
# ============================================================================


@pytest.mark.asyncio
async def test_get_config_value_returns_default_when_missing(
    db_session: AsyncSession,
):
    """Test that missing config key returns provided default."""
    result = await get_config_value(db_session, "nonexistent_key", "default_value")
    assert result == "default_value"


@pytest.mark.asyncio
async def test_get_config_value_returns_typed_value(
    db_session: AsyncSession,
):
    """Test that config value is returned with correct type."""
    # Insert a config value
    config = GlobalConfig(
        key="test_int_value",
        value="42",
        value_type="int",
        category="test",
        display_name="Test Int",
    )
    db_session.add(config)
    await db_session.commit()

    result = await get_config_value(db_session, "test_int_value", 0)
    assert result == 42
    assert isinstance(result, int)


@pytest.mark.asyncio
async def test_get_config_int_validates_type(
    db_session: AsyncSession,
):
    """Test that get_config_int returns int even if stored as string."""
    config = GlobalConfig(
        key="test_threshold",
        value="25",
        value_type="int",
        category="risk_thresholds",
        display_name="Test Threshold",
    )
    db_session.add(config)
    await db_session.commit()

    result = await get_config_int(db_session, "test_threshold", 15)
    assert result == 25
    assert isinstance(result, int)


@pytest.mark.asyncio
async def test_get_config_float_validates_type(
    db_session: AsyncSession,
):
    """Test that get_config_float returns float."""
    config = GlobalConfig(
        key="test_percentage",
        value="0.75",
        value_type="string",  # Even as string, should convert
        category="test",
        display_name="Test Percentage",
    )
    db_session.add(config)
    await db_session.commit()

    result = await get_config_float(db_session, "test_percentage", 0.80)
    assert result == 0.75
    assert isinstance(result, float)


# ============================================================================
# Risk Threshold Config Tests
# ============================================================================


async def _upsert_threshold_config(
    db_session: AsyncSession,
    *,
    key: str,
    value: int,
    display_name: str,
) -> GlobalConfig:
    result = await db_session.execute(select(GlobalConfig).where(GlobalConfig.key == key))
    config = result.scalar_one_or_none()
    if config is None:
        config = GlobalConfig(
            key=key,
            value=str(value),
            value_type="int",
            category="risk_thresholds",
            display_name=display_name,
            min_value=1,
            max_value=25,
            is_editable=True,
        )
        db_session.add(config)
    else:
        config.value = str(value)
        config.value_type = "int"
        config.category = "risk_thresholds"
        config.display_name = display_name
        config.min_value = 1
        config.max_value = 25
        config.is_editable = True
    await db_session.commit()
    await db_session.refresh(config)
    return config


async def _seed_risk_threshold_configs(
    db_session: AsyncSession,
    *,
    medium: int = 5,
    high: int = 10,
    critical: int = 16,
) -> None:
    await _upsert_threshold_config(
        db_session,
        key="medium_risk_min_net_score",
        value=medium,
        display_name="Medium Risk Minimum Net Score",
    )
    await _upsert_threshold_config(
        db_session,
        key="high_risk_min_net_score",
        value=high,
        display_name="High Risk Minimum Net Score",
    )
    await _upsert_threshold_config(
        db_session,
        key="critical_risk_min_net_score",
        value=critical,
        display_name="Critical Risk Minimum Net Score",
    )
    clear_config_cache()


def test_ConfigDefaults_thresholds_match_seed_defaults():
    assert ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE == 5
    assert ConfigDefaults.HIGH_RISK_MIN_NET_SCORE == 10
    assert ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE == 16
    assert ConfigDefaults.MAX_NET_SCORE == 25


def test_risk_response_schemas_bound_computed_scores_to_max_net_score():
    from datetime import UTC, datetime

    now = datetime(2026, 5, 9, tzinfo=UTC)

    with pytest.raises(PydanticValidationError):
        RiskRead(
            risk_id_code="R-BOUNDS-READ",
            name="Bounds Read",
            process="Bounds",
            risk_type="operational",
            description="Bounds",
            gross_probability=5,
            gross_impact=5,
            net_probability=5,
            net_impact=5,
            gross_score=26,
            net_score=25,
            status=RiskStatusEnum.active,
            is_priority=False,
            id=1,
            created_at=now,
            updated_at=now,
        )

    with pytest.raises(PydanticValidationError):
        RiskSummary(
            id=1,
            risk_id_code="R-BOUNDS-SUMMARY",
            name="Bounds Summary",
            process="Bounds",
            risk_type="operational",
            description="Bounds",
            gross_score=25,
            gross_probability=5,
            gross_impact=5,
            net_score=26,
            status=RiskStatusEnum.active,
            is_priority=False,
        )

    with pytest.raises(PydanticValidationError):
        RiskBriefForLink(
            id=1,
            risk_id_code="R-BOUNDS-LINK",
            name="Bounds Link",
            process="Bounds",
            description="Bounds",
            gross_score=26,
            net_score=25,
            is_archived=False,
        )


@pytest.mark.asyncio
async def test_global_config_update_rejects_non_increasing_risk_thresholds(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _seed_risk_threshold_configs(db_session, medium=5, high=10, critical=16)

    response = await client_cro.patch("/api/v1/riskhub/config/medium_risk_min_net_score", json={"value": "10"})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "value"]


def test_build_risk_level_ranges_rejects_non_increasing_thresholds():
    with pytest.raises(ValueError, match="non-increasing thresholds"):
        build_risk_level_ranges(5, 5, 16)


@pytest.mark.asyncio
async def test_global_config_update_clears_threshold_cache_after_commit(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    await _seed_risk_threshold_configs(db_session, medium=5, high=10, critical=16)

    assert await get_config_int(db_session, "high_risk_min_net_score", ConfigDefaults.HIGH_RISK_MIN_NET_SCORE) == 10

    response = await client_cro.patch("/api/v1/riskhub/config/high_risk_min_net_score", json={"value": "12"})

    assert response.status_code == 200
    assert await get_config_int(db_session, "high_risk_min_net_score", ConfigDefaults.HIGH_RISK_MIN_NET_SCORE) == 12


@pytest.mark.asyncio
async def test_is_high_risk_for_approval_uses_default_threshold(
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test is_high_risk_for_approval uses ConfigDefaults when no DB config exists."""
    # Create a risk with net_score at boundary (default threshold is 10)
    risk = Risk(
        risk_id_code="CRIT-001",
        name="Critical Threshold Risk",
        process="Threshold Test",
        description="Test risk at boundary",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=4,
        gross_impact=4,
        gross_score=16,
        net_probability=2,
        net_impact=5,
        net_score=10,  # Explicitly set - at threshold
        status="active",
        is_priority=False,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    # Default threshold is 10, score is 10 -> high risk for approval
    assert is_high_risk_for_approval(risk) is True

    # Create risk below threshold
    risk2 = Risk(
        risk_id_code="LOW-001",
        name="Low Threshold Risk",
        process="Low Risk Test",
        description="Test risk below threshold",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=3,
        net_score=9,  # Explicitly set - below threshold
        status="active",
        is_priority=False,
    )
    db_session.add(risk2)
    await db_session.commit()
    await db_session.refresh(risk2)

    assert is_high_risk_for_approval(risk2) is False


@pytest.mark.asyncio
async def test_is_high_risk_for_approval_async_uses_db_config(
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test is_high_risk_for_approval_async respects DB-configured threshold."""
    # Set a custom threshold in global_config
    config = GlobalConfig(
        key="high_risk_min_net_score",
        value="20",
        value_type="int",
        category="risk_thresholds",
        display_name="High Risk Minimum Net Score",
    )
    db_session.add(config)
    await db_session.commit()

    # Create a risk with net_score = 12 (above default 10, below DB-configured 20)
    risk = Risk(
        risk_id_code="MED-001",
        name="Medium Threshold Risk",
        process="Medium Risk Test",
        description="Test with custom threshold",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=4,
        gross_score=12,
        net_probability=3,
        net_impact=4,
        net_score=12,  # Explicitly set
        status="active",
        is_priority=False,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    # Sync version uses default (10), so high risk
    assert is_high_risk_for_approval(risk) is True

    # Async version uses DB config (20), so not high risk
    assert await is_high_risk_for_approval_async(risk, db_session) is False


@pytest.mark.asyncio
async def test_is_priority_overrides_threshold(
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test that is_priority=True makes risk high-risk regardless of score."""
    risk = Risk(
        risk_id_code="PRIO-001",
        name="Priority Risk",
        process="Priority Test",
        description="Low score but priority",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        gross_score=4,
        net_probability=1,
        net_impact=1,
        net_score=1,  # Explicitly set
        status="active",
        is_priority=True,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    assert is_high_risk_for_approval(risk) is True
    assert await is_high_risk_for_approval_async(risk, db_session) is True


# ============================================================================
# KRI Notification Timing Config Tests
# ============================================================================


@pytest.mark.asyncio
async def test_kri_deadline_service_loads_config(
    db_session: AsyncSession,
):
    """Test that KRIDeadlineService._load_config reads from global_config."""
    from app.services.kri_deadline_service import KRIDeadlineService

    # Insert custom config values
    configs = [
        GlobalConfig(
            key="advance_reminder_days",
            value="10",
            value_type="int",
            category="notifications",
            display_name="Advance Reminder Days",
        ),
        GlobalConfig(
            key="overdue_reminder_weeks",
            value="2",
            value_type="int",
            category="notifications",
            display_name="Overdue Reminder Weeks",
        ),
        GlobalConfig(
            key="near_breach_threshold",
            value="0.90",
            value_type="string",
            category="notifications",
            display_name="Near Breach Threshold",
        ),
    ]
    for c in configs:
        db_session.add(c)
    await db_session.commit()

    # Load config
    config = await KRIDeadlineService._load_config(db_session)

    assert config["advance_reminder_days"] == 10
    assert config["overdue_reminder_weeks"] == 2
    assert config["near_breach_threshold"] == 0.90
    # Defaults for missing keys
    assert config["duplicate_lookback_days"] == ConfigDefaults.DUPLICATE_LOOKBACK_DAYS
    assert config["reporting_grace_days"] == REPORTING_GRACE_DAYS


@pytest.mark.asyncio
async def test_kri_deadline_service_uses_defaults_when_no_config(
    db_session: AsyncSession,
):
    """Test that KRIDeadlineService uses ConfigDefaults when no DB values."""
    from app.services.kri_deadline_service import KRIDeadlineService

    config = await KRIDeadlineService._load_config(db_session)

    assert config["near_breach_threshold"] == ConfigDefaults.NEAR_BREACH_THRESHOLD
    assert config["duplicate_lookback_days"] == ConfigDefaults.DUPLICATE_LOOKBACK_DAYS
    assert config["reporting_grace_days"] == REPORTING_GRACE_DAYS
    assert config["advance_reminder_days"] == ConfigDefaults.ADVANCE_REMINDER_DAYS
    assert config["overdue_reminder_weeks"] == ConfigDefaults.OVERDUE_REMINDER_WEEKS


# ============================================================================
# Config Cache Tests
# ============================================================================


@pytest.mark.asyncio
async def test_config_cache_prevents_repeated_queries(
    db_session: AsyncSession,
):
    """Test that config cache reduces DB queries."""
    # First call - should hit DB
    await get_config_value(db_session, "cached_key", "cached_default")

    # Second call - should use cache (even if we modify DB)
    config = GlobalConfig(
        key="cached_key",
        value="db_value",
        value_type="string",
        category="test",
        display_name="Cached Test",
    )
    db_session.add(config)
    await db_session.commit()

    # Still returns cached default (not DB value)
    result2 = await get_config_value(db_session, "cached_key", "cached_default")
    assert result2 == "cached_default"  # Cache still has default

    # Clear cache and now DB value is returned
    clear_config_cache()
    result3 = await get_config_value(db_session, "cached_key", "cached_default")
    assert result3 == "db_value"
