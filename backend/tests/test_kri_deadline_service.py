"""Tests for KRI deadline checking service."""
import pytest
import pytest_asyncio
from datetime import datetime, UTC, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.kri_deadline_service import KRIDeadlineService
from app.services.notification_service import NotificationService
from app.models.notification import Notification, NotificationType
from app.models.key_risk_indicator import KeyRiskIndicator


@pytest_asyncio.fixture
async def test_kri_breached(db_session: AsyncSession, test_risk):
    """Create a KRI that is breached (above upper limit)."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Breached KRI",
        current_value=95.0,  # Above upper limit
        lower_limit=0.0,
        upper_limit=80.0,
        unit="%",
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest_asyncio.fixture
async def test_kri_near_breach(db_session: AsyncSession, test_risk):
    """Create a KRI that is near breach (80%+ of upper limit)."""
    # With limits 0-100, 80% threshold = 80
    # Current value 85 is above threshold but below upper limit
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Near Breach KRI",
        current_value=85.0,  # Above 80% of 100, but not exceeding
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest_asyncio.fixture
async def test_kri_healthy(db_session: AsyncSession, test_risk):
    """Create a healthy KRI (within limits, not near breach)."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Healthy KRI",
        current_value=50.0,  # Well within limits
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest.mark.asyncio
async def test_kri_breached_creates_notification(
    db_session: AsyncSession,
    test_kri_breached,
    test_user_cro,  # Owner of the test_risk
):
    """Test that a breached KRI triggers KRI_OVERDUE notification."""
    result = await KRIDeadlineService.check_kri_deadlines(db_session)
    
    assert result["breached"] >= 1
    assert result["notifications_created"] >= 1
    
    # Check notification was created for owner
    stmt = select(Notification).where(
        Notification.resource_type == "kri",
        Notification.resource_id == test_kri_breached.id,
        Notification.type == NotificationType.KRI_OVERDUE,
    )
    notifications = (await db_session.execute(stmt)).scalars().all()
    assert len(notifications) >= 1


@pytest.mark.asyncio
async def test_kri_near_breach_creates_notification(
    db_session: AsyncSession,
    test_kri_near_breach,
    test_user_cro,
):
    """Test that a near-breach KRI triggers KRI_NEAR_BREACH notification."""
    result = await KRIDeadlineService.check_kri_deadlines(db_session)
    
    assert result["near_breach"] >= 1
    
    # Check notification was created
    stmt = select(Notification).where(
        Notification.resource_type == "kri",
        Notification.resource_id == test_kri_near_breach.id,
        Notification.type == NotificationType.KRI_NEAR_BREACH,
    )
    notifications = (await db_session.execute(stmt)).scalars().all()
    assert len(notifications) >= 1


@pytest.mark.asyncio
async def test_healthy_kri_no_notification(
    db_session: AsyncSession,
    test_kri_healthy,
):
    """Test that a healthy KRI does not create notifications."""
    result = await KRIDeadlineService.check_kri_deadlines(db_session)
    
    # Check no notification was created for this KRI
    stmt = select(Notification).where(
        Notification.resource_type == "kri",
        Notification.resource_id == test_kri_healthy.id,
    )
    notifications = (await db_session.execute(stmt)).scalars().all()
    assert len(notifications) == 0


@pytest.mark.asyncio
async def test_duplicate_notification_prevented(
    db_session: AsyncSession,
    test_kri_breached,
    test_user_cro,
):
    """Test that duplicate notifications are not sent within lookback period."""
    # First check creates notification
    result1 = await KRIDeadlineService.check_kri_deadlines(db_session)
    initial_count = result1["notifications_created"]
    
    # Second check should not create duplicate
    result2 = await KRIDeadlineService.check_kri_deadlines(db_session)
    
    # The breached count still shows 1 (KRI is still breached)
    # But notifications_created should be 0 for the second run
    assert result2["notifications_created"] == 0


@pytest.mark.asyncio
async def test_check_returns_correct_counts(
    db_session: AsyncSession,
    test_kri_breached,
    test_kri_near_breach,
    test_kri_healthy,
):
    """Test that check returns correct counts for all KRI types."""
    result = await KRIDeadlineService.check_kri_deadlines(db_session)
    
    assert "total_kris_checked" in result
    assert "breached" in result
    assert "near_breach" in result
    assert "notifications_created" in result
    
    assert result["total_kris_checked"] >= 3  # At least our 3 test KRIs


# Frequency-based Reminder Tests

@pytest_asyncio.fixture
async def test_kri_due_soon(db_session: AsyncSession, test_risk):
    """Create a KRI where period end is in 7 days (advance reminder trigger)."""
    from datetime import date, timedelta
    
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Due Soon KRI",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency="monthly",
        created_at=datetime.now(UTC) - timedelta(days=23),  # Period ends in 7 days
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest.mark.asyncio
async def test_deadline_service_returns_due_soon_count(
    db_session: AsyncSession,
    test_risk,
    test_user_cro,
):
    """Test that check includes due_soon count in results."""
    result = await KRIDeadlineService.check_kri_deadlines(db_session)
    
    assert "due_soon" in result
    assert "deadline" in result
    assert "overdue" in result


@pytest.mark.asyncio
async def test_frequency_conversion(db_session: AsyncSession):
    """Test the frequency-to-days helper."""
    from app.services.kri_deadline_service import KRIDeadlineService
    
    assert KRIDeadlineService._frequency_to_days("daily") == 1
    assert KRIDeadlineService._frequency_to_days("weekly") == 7
    assert KRIDeadlineService._frequency_to_days("monthly") == 30
    assert KRIDeadlineService._frequency_to_days("quarterly") == 90
    assert KRIDeadlineService._frequency_to_days("annually") == 365


@pytest.mark.asyncio
async def test_period_calculation(db_session: AsyncSession, test_risk):
    """Test the period start/end calculation."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Test Period KRI",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency="quarterly",
        created_at=datetime.now(UTC) - timedelta(days=10),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    
    period_start, period_end = KRIDeadlineService._current_period(kri)
    
    assert period_start == kri.created_at.date()
    assert (period_end - period_start).days == 89  # Quarterly = 90 days


@pytest.mark.asyncio
async def test_due_date_calculation(db_session: AsyncSession, test_risk):
    """Test due date is period_end + 15 days."""
    from datetime import date, timedelta
    
    period_end = date(2025, 3, 31)
    due = KRIDeadlineService._due_date(period_end)
    
    assert due == date(2025, 4, 15)


@pytest.mark.asyncio
async def test_deadline_service_constants():
    """Test deadline service constants are set correctly."""
    assert KRIDeadlineService.REPORTING_GRACE_DAYS == 15
    assert KRIDeadlineService.ADVANCE_REMINDER_DAYS == 7
    assert KRIDeadlineService.OVERDUE_REMINDER_WEEKS == 7
