"""Tests for KRI deadline checking service."""

from datetime import UTC, date, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.notification import Notification, NotificationType
from app.models.user import AccessScope
from app.services.kri_deadline_decisions import (
    build_kri_limit_notification_plan,
    build_kri_reporting_notification_plan,
)
from app.services.kri_deadline_service import KRIDeadlineService


@pytest_asyncio.fixture
async def test_kri_breached(db_session: AsyncSession, test_risk):
    """Create a KRI that is breached (above upper limit)."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Breached KRI",
        description="Test KRI that is breached (above upper limit)",
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
        description="Test KRI that is near breach threshold",
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
        description="Test KRI with healthy values within limits",
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
    """Test that a breached KRI triggers KRI_BREACH_DETECTED notification."""
    result = await KRIDeadlineService.check_kri_deadlines(db_session)

    assert result["breached"] >= 1
    assert result["notifications_created"] >= 1

    # Check notification was created for owner
    stmt = select(Notification).where(
        Notification.resource_type == "kri",
        Notification.resource_id == test_kri_breached.id,
        Notification.type == NotificationType.KRI_BREACH_DETECTED,
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
    """Healthy KRI should not trigger breach/near-breach notifications."""
    await KRIDeadlineService.check_kri_deadlines(db_session)

    # Deadline reminders are time-dependent; assert only breach-related notifications are absent.
    stmt = select(Notification).where(
        Notification.resource_type == "kri",
        Notification.resource_id == test_kri_healthy.id,
        Notification.type.in_([NotificationType.KRI_NEAR_BREACH, NotificationType.KRI_BREACH_DETECTED]),
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
    assert result1["notifications_created"] >= 1

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


@pytest.mark.asyncio
async def test_breached_kri_does_not_notify_out_of_scope_risk_manager(
    db_session: AsyncSession,
    test_kri_breached: KeyRiskIndicator,
    test_role_risk_manager,
):
    other_department = Department(name="Other Dept (KRI notif)", code="KRI2", description="Other dept")
    db_session.add(other_department)
    await db_session.commit()
    await db_session.refresh(other_department)

    rm_other_dept = User(
        name="RM Other Dept",
        email="rm_other_kri@test.com",
        department_id=other_department.id,
        role_id=test_role_risk_manager.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(rm_other_dept)
    await db_session.commit()
    await db_session.refresh(rm_other_dept)

    await KRIDeadlineService.check_kri_deadlines(db_session)
    stmt = select(Notification).where(
        Notification.user_id == rm_other_dept.id,
        Notification.resource_type == "kri",
        Notification.resource_id == test_kri_breached.id,
        Notification.type == NotificationType.KRI_BREACH_DETECTED,
    )
    notifications = (await db_session.execute(stmt)).scalars().all()
    assert notifications == []


@pytest.mark.asyncio
async def test_breached_kri_notifies_in_scope_risk_manager(
    db_session: AsyncSession,
    test_kri_breached: KeyRiskIndicator,
    test_user_risk_manager: User,
):
    await KRIDeadlineService.check_kri_deadlines(db_session)

    stmt = select(Notification).where(
        Notification.user_id == test_user_risk_manager.id,
        Notification.resource_type == "kri",
        Notification.resource_id == test_kri_breached.id,
        Notification.type == NotificationType.KRI_BREACH_DETECTED,
    )
    notifications = (await db_session.execute(stmt)).scalars().all()

    assert len(notifications) == 1


# Frequency-based Reminder Tests


@pytest_asyncio.fixture
async def test_kri_due_soon(db_session: AsyncSession, test_risk):
    """Create a KRI where period end is in 7 days (advance reminder trigger)."""

    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Due Soon KRI",
        description="Test KRI due for reporting soon",
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
async def test_due_soon_notification_type(
    db_session: AsyncSession,
    test_risk,
    test_user_cro,
):
    """Test due soon reminders use KRI_DUE_SOON notification type."""
    fixed_today = date(2025, 1, 24)  # 7 days before Jan 31
    fixed_now = datetime(2025, 1, 24, 9, 0, tzinfo=UTC)

    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Due Soon Check",
        description="Test KRI for due soon notification check",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency="monthly",
        reporting_owner_id=test_user_cro.id,
        last_period_end=date(2024, 12, 31),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    await KRIDeadlineService.check_kri_deadlines(db_session, today=fixed_today, now=fixed_now)

    stmt = select(Notification).where(
        Notification.resource_type == "kri",
        Notification.resource_id == kri.id,
        Notification.type == NotificationType.KRI_DUE_SOON,
    )
    notifications = (await db_session.execute(stmt)).scalars().all()
    assert len(notifications) >= 1


@pytest.mark.asyncio
async def test_due_soon_dedupe_allows_new_reporting_period(
    db_session: AsyncSession,
    test_risk,
    test_user_cro,
):
    fixed_now = datetime(2025, 1, 24, 9, 0, tzinfo=UTC)
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Period Scoped Due Soon",
        description="Test KRI for period-scoped due soon dedupe",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency="monthly",
        reporting_owner_id=test_user_cro.id,
        last_period_end=date(2024, 12, 31),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    db_session.add(
        Notification(
            user_id=test_user_cro.id,
            type=NotificationType.KRI_DUE_SOON,
            title="Prior period",
            message="KRI 'Period Scoped Due Soon' reporting period ends on 2024-12-31.",
            resource_type="kri",
            resource_id=kri.id,
            created_at=fixed_now - timedelta(days=2),
        )
    )
    await db_session.commit()

    result = await KRIDeadlineService.check_kri_deadlines(
        db_session,
        today=date(2025, 1, 24),
        now=fixed_now,
    )

    assert result["due_soon"] >= 1
    stmt = select(Notification).where(
        Notification.resource_type == "kri",
        Notification.resource_id == kri.id,
        Notification.type == NotificationType.KRI_DUE_SOON,
        Notification.message.contains("2025-01-31"),
    )
    notifications = (await db_session.execute(stmt)).scalars().all()
    assert len(notifications) == 1


@pytest.mark.asyncio
async def test_due_date_calculation(db_session: AsyncSession, test_risk):
    """Test due date is period_end + 15 days."""
    from datetime import date

    period_end = date(2025, 3, 31)
    due = KRIDeadlineService._due_date(period_end)

    assert due == date(2025, 4, 15)


@pytest.mark.asyncio
async def test_deadline_service_constants():
    """Test deadline service constants are set correctly."""
    assert KRIDeadlineService.REPORTING_GRACE_DAYS == 15
    assert KRIDeadlineService.ADVANCE_REMINDER_DAYS == 7
    assert KRIDeadlineService.OVERDUE_REMINDER_WEEKS == 1  # Weekly reminders


def test_reporting_notification_plan_covers_due_soon_deadline_and_overdue() -> None:
    config = {
        "advance_reminder_days": 7,
        "reporting_grace_days": 15,
        "overdue_reminder_weeks": 1,
    }
    kri = KeyRiskIndicator(metric_name="Decision KRI")
    period_end = date(2025, 1, 31)
    due = date(2025, 2, 15)

    due_soon = build_kri_reporting_notification_plan(
        kri=kri,
        period_end=period_end,
        due=due,
        today=date(2025, 1, 24),
        config=config,
    )
    assert due_soon is not None
    assert due_soon.notification_type == NotificationType.KRI_DUE_SOON
    assert due_soon.result_bucket == "due_soon"
    assert "2025-01-31" in due_soon.message

    deadline = build_kri_reporting_notification_plan(
        kri=kri,
        period_end=period_end,
        due=due,
        today=due,
        config=config,
    )
    assert deadline is not None
    assert deadline.notification_type == NotificationType.KRI_DUE_TOMORROW
    assert deadline.result_bucket == "deadline"

    overdue = build_kri_reporting_notification_plan(
        kri=kri,
        period_end=period_end,
        due=due,
        today=date(2025, 2, 22),
        config=config,
    )
    assert overdue is not None
    assert overdue.notification_type == NotificationType.KRI_OVERDUE
    assert overdue.result_bucket == "overdue"
    assert "7 days overdue" in overdue.message


def test_limit_notification_plan_covers_breach_near_breach_and_healthy() -> None:
    config = {"near_breach_threshold": 0.8}

    breached = KeyRiskIndicator(
        metric_name="Breached Decision KRI",
        current_value=95,
        lower_limit=0,
        upper_limit=80,
    )
    breached_plan = build_kri_limit_notification_plan(kri=breached, config=config)
    assert breached_plan is not None
    assert breached_plan.notification_type == NotificationType.KRI_BREACH_DETECTED
    assert breached_plan.result_bucket is None
    assert "is above limit" in breached_plan.message

    near_breach = KeyRiskIndicator(
        metric_name="Near Decision KRI",
        current_value=85,
        lower_limit=0,
        upper_limit=100,
    )
    near_breach_plan = build_kri_limit_notification_plan(kri=near_breach, config=config)
    assert near_breach_plan is not None
    assert near_breach_plan.notification_type == NotificationType.KRI_NEAR_BREACH
    assert near_breach_plan.result_bucket == "near_breach"

    healthy = KeyRiskIndicator(
        metric_name="Healthy Decision KRI",
        current_value=50,
        lower_limit=0,
        upper_limit=100,
    )
    assert build_kri_limit_notification_plan(kri=healthy, config=config) is None
