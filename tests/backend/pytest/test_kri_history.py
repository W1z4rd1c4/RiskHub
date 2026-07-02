"""Tests for KRI history service and history recording functionality."""

from datetime import UTC, date, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_risk_indicator import KeyRiskIndicator, KRIFrequency
from app.models.kri_history import KRIValueHistory
from app.services._kri_history.constants import REPORTING_GRACE_DAYS
from app.services._kri_history.service import KRIHistoryService


def _previous_period_end(period_end: date, frequency: str) -> date:
    period_start, _ = KRIHistoryService.period_bounds_for_date(period_end, frequency)
    previous_date = period_start - timedelta(days=1)
    return KRIHistoryService.period_bounds_for_date(previous_date, frequency)[1]


@pytest_asyncio.fixture
async def test_kri_quarterly(db_session: AsyncSession, test_risk):
    """Create a quarterly KRI with no history."""
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Test Quarterly KRI",
        description="Test quarterly KRI for unit testing",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.quarterly.value,
        created_at=datetime.now(UTC) - timedelta(days=10),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest_asyncio.fixture
async def test_kri_with_history(db_session: AsyncSession, test_risk, test_user_cro):
    """Create a KRI with existing history entry."""
    period_start, period_end = KRIHistoryService.latest_closed_period_for_date(date.today(), KRIFrequency.monthly.value)
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="KRI With History",
        description="KRI with existing history entries for testing",
        current_value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        frequency=KRIFrequency.monthly.value,
        created_at=datetime.now(UTC) - timedelta(days=60),
        last_period_end=period_end,
        last_reported_at=datetime.now(UTC) - timedelta(days=1),
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    # Add a history entry
    history = KRIValueHistory(
        kri_id=kri.id,
        period_start=period_start,
        period_end=period_end,
        recorded_at=datetime.now(UTC) - timedelta(days=1),
        recorded_by_id=test_user_cro.id,
        value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
        breach_status="within",
    )
    db_session.add(history)
    await db_session.commit()

    return kri


# Period Calculation Tests


class TestPeriodCalculation:
    """Tests for period calculation helpers."""

    def test_period_bounds_daily(self):
        """Test daily period boundaries."""
        target = date(2025, 2, 5)
        period_start, period_end = KRIHistoryService.period_bounds_for_date(target, KRIFrequency.daily.value)
        assert period_start == date(2025, 2, 5)
        assert period_end == date(2025, 2, 5)

    def test_period_bounds_weekly(self):
        """Test weekly period boundaries (ISO Monday-Sunday)."""
        target = date(2025, 2, 5)  # Wednesday
        period_start, period_end = KRIHistoryService.period_bounds_for_date(target, KRIFrequency.weekly.value)
        assert period_start == date(2025, 2, 3)
        assert period_end == date(2025, 2, 9)

    def test_period_bounds_monthly(self):
        """Test monthly period boundaries."""
        target = date(2025, 2, 5)
        period_start, period_end = KRIHistoryService.period_bounds_for_date(target, KRIFrequency.monthly.value)
        assert period_start == date(2025, 2, 1)
        assert period_end == date(2025, 2, 28)

    def test_period_bounds_quarterly(self):
        """Test quarterly period boundaries."""
        target = date(2025, 5, 10)
        period_start, period_end = KRIHistoryService.period_bounds_for_date(target, KRIFrequency.quarterly.value)
        assert period_start == date(2025, 4, 1)
        assert period_end == date(2025, 6, 30)

    def test_period_bounds_annually(self):
        """Test annual period boundaries."""
        target = date(2025, 7, 1)
        period_start, period_end = KRIHistoryService.period_bounds_for_date(target, KRIFrequency.annually.value)
        assert period_start == date(2025, 1, 1)
        assert period_end == date(2025, 12, 31)

    def test_latest_closed_period(self):
        """Test latest closed period for a mid-period date."""
        target = date(2025, 2, 15)
        period_start, period_end = KRIHistoryService.latest_closed_period_for_date(target, KRIFrequency.monthly.value)
        assert period_start == date(2025, 1, 1)
        assert period_end == date(2025, 1, 31)

    def test_due_date_calculation(self):
        """Test due date is period_end + 15 days."""
        period_end = date(2025, 3, 31)
        due = KRIHistoryService.due_date(period_end)
        assert due == date(2025, 4, 15)

    @pytest.mark.asyncio
    async def test_current_period_calendar_alignment(self, test_kri_quarterly):
        """Test current period aligns to calendar quarters."""
        as_of = date(2025, 2, 15)
        period_start, period_end = KRIHistoryService.current_period(test_kri_quarterly, as_of=as_of)
        assert period_start == date(2025, 1, 1)
        assert period_end == date(2025, 3, 31)


# Value Recording Tests


class TestRecordValue:
    """Tests for recording KRI values."""

    @pytest.mark.asyncio
    async def test_record_value_creates_history(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """Test that recording a value creates a history entry."""
        entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=75.0,
            recorded_by_id=test_user_cro.id,
            is_privileged=True,
        )

        await db_session.commit()

        assert entry is not None
        assert entry.value == 75.0
        assert entry.kri_id == test_kri_quarterly.id
        assert entry.recorded_by_id == test_user_cro.id
        assert entry.breach_status == "within"

    @pytest.mark.asyncio
    async def test_record_value_updates_kri(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """Test that recording updates KRI current_value and last_period_end."""
        original_value = test_kri_quarterly.current_value
        expected_end = KRIHistoryService.latest_closed_period_for_date(date.today(), test_kri_quarterly.frequency)[1]

        await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=80.0,
            recorded_by_id=test_user_cro.id,
            is_privileged=True,
        )
        await db_session.commit()

        await db_session.refresh(test_kri_quarterly)

        assert test_kri_quarterly.current_value == 80.0
        assert test_kri_quarterly.current_value != original_value
        assert test_kri_quarterly.last_period_end == expected_end

    @pytest.mark.asyncio
    async def test_record_value_breach_above(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """Test breach status is set when value exceeds upper limit."""
        entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=110.0,  # Above upper limit of 100
            recorded_by_id=test_user_cro.id,
            is_privileged=True,
        )

        assert entry.breach_status == "above"

    @pytest.mark.asyncio
    async def test_record_value_breach_below(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """Test breach status is set when value is below lower limit."""
        entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=-5.0,  # Below lower limit of 0
            recorded_by_id=test_user_cro.id,
            is_privileged=True,
        )

        assert entry.breach_status == "below"

    @pytest.mark.asyncio
    async def test_privileged_backdating(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """Test that privileged users can backdate entries."""
        latest_end = KRIHistoryService.latest_closed_period_for_date(date.today(), test_kri_quarterly.frequency)[1]
        past_period_end = _previous_period_end(latest_end, test_kri_quarterly.frequency)

        entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=55.0,
            recorded_by_id=test_user_cro.id,
            period_end=past_period_end,
            is_privileged=True,
        )

        assert entry.period_end == past_period_end

    @pytest.mark.asyncio
    async def test_non_privileged_backdating_blocked(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """Test non-privileged users cannot backdate to older periods."""
        latest_end = KRIHistoryService.latest_closed_period_for_date(date.today(), test_kri_quarterly.frequency)[1]
        past_period_end = _previous_period_end(latest_end, test_kri_quarterly.frequency)

        with pytest.raises(ValueError):
            await KRIHistoryService.record_value(
                db=db_session,
                kri=test_kri_quarterly,
                value=55.0,
                recorded_by_id=test_user_cro.id,
                period_end=past_period_end,
                is_privileged=False,
            )

    @pytest.mark.asyncio
    async def test_non_privileged_grace_window_enforced(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test non-privileged users cannot report after grace window."""
        cutoff_date = date.today() - timedelta(days=REPORTING_GRACE_DAYS + 1)
        past_period_end = KRIHistoryService.latest_closed_period_for_date(cutoff_date, test_kri_quarterly.frequency)[1]

        with pytest.raises(ValueError):
            await KRIHistoryService.record_value(
                db=db_session,
                kri=test_kri_quarterly,
                value=60.0,
                recorded_by_id=test_user_cro.id,
                period_end=past_period_end,
                is_privileged=False,
            )

    @pytest.mark.asyncio
    async def test_backdated_entry_does_not_override_current(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test backdated entries do not regress current KRI state."""
        latest_end = KRIHistoryService.latest_closed_period_for_date(date.today(), test_kri_quarterly.frequency)[1]
        await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=88.0,
            recorded_by_id=test_user_cro.id,
            period_end=latest_end,
            is_privileged=True,
        )
        await db_session.commit()
        await db_session.refresh(test_kri_quarterly)
        current_value = test_kri_quarterly.current_value

        past_period_end = _previous_period_end(latest_end, test_kri_quarterly.frequency)
        await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=10.0,
            recorded_by_id=test_user_cro.id,
            period_end=past_period_end,
            is_privileged=True,
        )
        await db_session.commit()
        await db_session.refresh(test_kri_quarterly)

        assert test_kri_quarterly.current_value == current_value
        assert test_kri_quarterly.last_period_end == latest_end

    @pytest.mark.asyncio
    async def test_allow_open_period_accepts_current_period(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test allow_open_period=True with is_privileged=True allows current period recording."""
        today = date.today()
        _, current_period_end = KRIHistoryService.period_bounds_for_date(today, test_kri_quarterly.frequency)

        # Only works if period end is in the future (open period)
        if current_period_end > today:
            entry = await KRIHistoryService.record_value(
                db=db_session,
                kri=test_kri_quarterly,
                value=65.0,
                recorded_by_id=test_user_cro.id,
                period_end=current_period_end,
                is_privileged=True,
                allow_open_period=True,
            )

            assert entry.period_end == current_period_end
            assert entry.value == 65.0

    @pytest.mark.asyncio
    async def test_open_period_rejected_without_flag(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """Test open period recording is rejected without allow_open_period flag."""
        today = date.today()
        _, current_period_end = KRIHistoryService.period_bounds_for_date(today, test_kri_quarterly.frequency)

        # Only test if period end is in the future (open period)
        if current_period_end > today:
            with pytest.raises(ValueError, match="Cannot record a future period"):
                await KRIHistoryService.record_value(
                    db=db_session,
                    kri=test_kri_quarterly,
                    value=65.0,
                    recorded_by_id=test_user_cro.id,
                    period_end=current_period_end,
                    is_privileged=True,
                    allow_open_period=False,  # Flag not set
                )

    @pytest.mark.asyncio
    async def test_future_recorded_at_rejected(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """History recorded_at is factual and cannot be future-dated."""
        future_recorded_at = datetime.now(UTC) + timedelta(days=1)

        with pytest.raises(ValueError, match="recorded_at cannot be in the future"):
            await KRIHistoryService.record_value(
                db=db_session,
                kri=test_kri_quarterly,
                value=65.0,
                recorded_by_id=test_user_cro.id,
                recorded_at=future_recorded_at,
                is_privileged=True,
            )

    @pytest.mark.asyncio
    async def test_historical_recorded_at_allowed(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """Valid historical recorded_at values are preserved."""
        historical_recorded_at = datetime.now(UTC) - timedelta(days=1)

        entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=65.0,
            recorded_by_id=test_user_cro.id,
            recorded_at=historical_recorded_at,
            is_privileged=True,
        )

        assert entry.recorded_at == historical_recorded_at

    @pytest.mark.asyncio
    async def test_open_period_rejected_without_privilege(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test open period recording is rejected without is_privileged flag."""
        today = date.today()
        _, current_period_end = KRIHistoryService.period_bounds_for_date(today, test_kri_quarterly.frequency)

        # Only test if period end is in the future (open period)
        if current_period_end > today:
            with pytest.raises(ValueError, match="Cannot record a future period"):
                await KRIHistoryService.record_value(
                    db=db_session,
                    kri=test_kri_quarterly,
                    value=65.0,
                    recorded_by_id=test_user_cro.id,
                    period_end=current_period_end,
                    is_privileged=False,  # Not privileged
                    allow_open_period=True,
                )

    @pytest.mark.asyncio
    async def test_arbitrary_future_period_still_rejected(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test that arbitrary future dates are rejected even with allow_open_period."""
        # Use a date far in the future, not aligned to current period
        future_date = date.today() + timedelta(days=365)

        with pytest.raises(ValueError, match="Cannot record a future period"):
            await KRIHistoryService.record_value(
                db=db_session,
                kri=test_kri_quarterly,
                value=65.0,
                recorded_by_id=test_user_cro.id,
                period_end=future_date,
                is_privileged=True,
                allow_open_period=True,
            )


# History Retrieval Tests


class TestGetHistory:
    """Tests for retrieving KRI history."""

    @pytest.mark.asyncio
    async def test_get_history_returns_entries(self, db_session: AsyncSession, test_kri_with_history):
        """Test that get_history returns history entries."""
        entries, total = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_with_history.id,
        )

        assert total >= 1
        assert len(entries) >= 1

    @pytest.mark.asyncio
    async def test_get_history_empty_for_new_kri(self, db_session: AsyncSession, test_kri_quarterly):
        """Test that get_history returns empty for KRI without history."""
        entries, total = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_quarterly.id,
        )

        assert total == 0
        assert len(entries) == 0

    @pytest.mark.asyncio
    async def test_get_history_pagination(self, db_session: AsyncSession, test_kri_quarterly, test_user_cro):
        """Test history pagination works correctly."""
        # Create 5 history entries
        period_end = KRIHistoryService.latest_closed_period_for_date(date.today(), test_kri_quarterly.frequency)[1]
        for i in range(5):
            await KRIHistoryService.record_value(
                db=db_session,
                kri=test_kri_quarterly,
                value=50.0 + i,
                recorded_by_id=test_user_cro.id,
                period_end=period_end,
                is_privileged=True,
            )
            period_end = _previous_period_end(period_end, test_kri_quarterly.frequency)
        await db_session.commit()

        # Get page 1 with size 2
        entries, total = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_quarterly.id,
            page=1,
            size=2,
        )

        assert total == 5
        assert len(entries) == 2


class TestOverdueKris:
    """Tests for overdue KRI detection."""

    @pytest.mark.asyncio
    async def test_get_overdue_uses_calendar_periods(self, monkeypatch, db_session: AsyncSession, test_risk):
        """Test overdue detection uses latest closed calendar period."""
        import app.services._kri_history.clock as kri_history_clock

        monkeypatch.setattr(kri_history_clock, "utc_now", lambda: datetime(2025, 2, 20, 12, tzinfo=UTC))

        kri = KeyRiskIndicator(
            risk_id=test_risk.id,
            metric_name="Overdue KRI",
            description="Overdue KRI for testing calendar periods",
            current_value=50.0,
            lower_limit=0.0,
            upper_limit=100.0,
            unit="%",
            frequency=KRIFrequency.monthly.value,
            created_at=datetime(2025, 1, 1, tzinfo=UTC),
        )
        db_session.add(kri)
        await db_session.commit()
        await db_session.refresh(kri)

        overdue = await KRIHistoryService.get_overdue_kris(db_session)
        match = next((item for item in overdue if item["kri_id"] == kri.id), None)
        assert match is not None
        assert match["period_end"] == "2025-01-31"
        assert match["due_date"] == "2025-02-15"


# Correction Tests


class TestHistoryCorrection:
    """Tests for applying corrections to history entries."""

    @pytest.mark.asyncio
    async def test_apply_correction_updates_value(self, db_session: AsyncSession, test_kri_with_history, test_user_cro):
        """Test that applying a correction updates the entry value."""
        # Get the existing history entry
        entries, _ = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_with_history.id,
        )
        entry = entries[0]

        # Apply correction
        corrected = await KRIHistoryService.apply_history_correction(
            db=db_session,
            entry_id=entry.id,
            new_value=99.0,
            corrected_by_id=test_user_cro.id,
        )

        assert corrected.value == 99.0
        await db_session.refresh(test_kri_with_history)
        assert test_kri_with_history.current_value == 99.0

    @pytest.mark.asyncio
    async def test_apply_correction_records_audit_activity(
        self, db_session: AsyncSession, test_kri_with_history, test_user_cro
    ):
        """Every history correction leaves an activity-log record of old and new value."""
        from sqlalchemy import select

        from app.models import ActivityLog
        from app.models.activity_log import ActivityAction, ActivityEntityType

        entries, _ = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_with_history.id,
        )
        entry = entries[0]

        await KRIHistoryService.apply_history_correction(
            db=db_session,
            entry_id=entry.id,
            new_value=99.0,
            corrected_by_id=test_user_cro.id,
        )
        await db_session.commit()

        activity = await db_session.scalar(
            select(ActivityLog).where(
                ActivityLog.entity_type == ActivityEntityType.KRI_VALUE.value,
                ActivityLog.entity_id == entry.id,
                ActivityLog.action == ActivityAction.UPDATE.value,
            )
        )
        assert activity is not None
        assert activity.changes["value"] == {"old": 45.0, "new": 99.0}
        assert activity.actor_id == test_user_cro.id

    @pytest.mark.asyncio
    async def test_correction_recalculates_breach_status(
        self, db_session: AsyncSession, test_kri_with_history, test_user_cro
    ):
        """Test that correction recalculates breach status."""
        entries, _ = await KRIHistoryService.get_history(
            db=db_session,
            kri_id=test_kri_with_history.id,
        )
        entry = entries[0]

        # Apply correction that causes breach
        corrected = await KRIHistoryService.apply_history_correction(
            db=db_session,
            entry_id=entry.id,
            new_value=150.0,  # Above upper limit 100
            corrected_by_id=test_user_cro.id,
        )

        assert corrected.breach_status == "above"

    @pytest.mark.asyncio
    async def test_correction_does_not_update_current_for_older_period(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """Test corrections on older periods do not update current value."""
        latest_end = KRIHistoryService.latest_closed_period_for_date(date.today(), test_kri_quarterly.frequency)[1]
        older_end = _previous_period_end(latest_end, test_kri_quarterly.frequency)

        await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=70.0,
            recorded_by_id=test_user_cro.id,
            period_end=latest_end,
            is_privileged=True,
        )
        older_entry = await KRIHistoryService.record_value(
            db=db_session,
            kri=test_kri_quarterly,
            value=40.0,
            recorded_by_id=test_user_cro.id,
            period_end=older_end,
            is_privileged=True,
        )
        await db_session.commit()
        await db_session.refresh(test_kri_quarterly)
        current_value = test_kri_quarterly.current_value

        await KRIHistoryService.apply_history_correction(
            db=db_session,
            entry_id=older_entry.id,
            new_value=10.0,
            corrected_by_id=test_user_cro.id,
        )
        await db_session.commit()
        await db_session.refresh(test_kri_quarterly)

        assert test_kri_quarterly.current_value == current_value

    @pytest.mark.asyncio
    async def test_correction_updates_current_for_latest_period_when_recorded_at_ties(
        self, db_session: AsyncSession, test_kri_quarterly, test_user_cro
    ):
        """When recorded_at ties, the newest business period is the latest entry."""
        recorded_at = datetime(2026, 4, 10, 12, 0, tzinfo=UTC)
        latest_entry = KRIValueHistory(
            kri_id=test_kri_quarterly.id,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            recorded_at=recorded_at,
            recorded_by_id=test_user_cro.id,
            value=50.0,
            lower_limit=0.0,
            upper_limit=100.0,
            unit="%",
            breach_status="within",
        )
        older_entry = KRIValueHistory(
            kri_id=test_kri_quarterly.id,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            recorded_at=recorded_at,
            recorded_by_id=test_user_cro.id,
            value=40.0,
            lower_limit=0.0,
            upper_limit=100.0,
            unit="%",
            breach_status="within",
        )
        db_session.add_all([latest_entry, older_entry])
        await db_session.commit()
        await db_session.refresh(latest_entry)
        await db_session.refresh(older_entry)
        assert older_entry.id > latest_entry.id

        await KRIHistoryService.apply_history_correction(
            db=db_session,
            entry_id=latest_entry.id,
            new_value=90.0,
            corrected_by_id=test_user_cro.id,
        )
        await db_session.commit()
        await db_session.refresh(test_kri_quarterly)

        assert test_kri_quarterly.current_value == 90.0
