"""
Tests for global_config usage in critical paths.

Validates that configuration values from global_config affect:
- Risk severity thresholds (is_high_risk_for_approval)
- KRI notification timing (deadline service)
"""
import pytest
from datetime import date, timedelta
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Risk, User, Department
from app.models.global_config import (
    GlobalConfig,
    ConfigDefaults,
    get_config_int,
    get_config_float,
    get_config_value,
    clear_config_cache,
)
from app.core.permissions import (
    is_high_risk_for_approval,
    is_high_risk_for_approval_async,
    is_critical_risk,
    is_critical_risk_async,
)


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

def test_ConfigDefaults_thresholds_match_seed_defaults():
    assert ConfigDefaults.MEDIUM_RISK_MIN_NET_SCORE == 5
    assert ConfigDefaults.HIGH_RISK_MIN_NET_SCORE == 10
    assert ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE == 16


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
# Backward Compatibility Alias Tests (Regression Guard)
# ============================================================================

@pytest.mark.asyncio
async def test_deprecated_is_critical_risk_alias_matches_new_helper(
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    """Test that deprecated is_critical_risk aliases behave identically to new helpers.
    
    This is a regression guard - if this test fails, backward compatibility is broken.
    """
    risk = Risk(
        risk_id_code="ALIAS-001",
        name="Alias Test Risk",
        process="Alias Test",
        description="Test backward compatibility",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=4,
        gross_score=12,
        net_probability=3,
        net_impact=4,
        net_score=12,
        status="active",
        is_priority=False,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    
    # Sync: alias should return same result as new helper
    assert is_critical_risk(risk) == is_high_risk_for_approval(risk)
    
    # Async: alias should return same result as new helper
    alias_result = await is_critical_risk_async(risk, db_session)
    new_result = await is_high_risk_for_approval_async(risk, db_session)
    assert alias_result == new_result


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
    assert config["reporting_grace_days"] == ConfigDefaults.REPORTING_GRACE_DAYS


@pytest.mark.asyncio
async def test_kri_deadline_service_uses_defaults_when_no_config(
    db_session: AsyncSession,
):
    """Test that KRIDeadlineService uses ConfigDefaults when no DB values."""
    from app.services.kri_deadline_service import KRIDeadlineService
    
    config = await KRIDeadlineService._load_config(db_session)
    
    assert config["near_breach_threshold"] == ConfigDefaults.NEAR_BREACH_THRESHOLD
    assert config["duplicate_lookback_days"] == ConfigDefaults.DUPLICATE_LOOKBACK_DAYS
    assert config["reporting_grace_days"] == ConfigDefaults.REPORTING_GRACE_DAYS
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
    result1 = await get_config_value(db_session, "cached_key", "cached_default")
    
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
