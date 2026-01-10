"""Tests for KRI period validation and protection logic."""
import pytest
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, AsyncMock

from app.services.kri_history_service import KRIHistoryService
from app.models.key_risk_indicator import KRIFrequency


class TestKRIPeriodProtection:
    """Verify that KRI period semantics protect against invalid submissions."""
    @pytest.mark.asyncio
    async def test_future_period_rejected(self):
        """Non-privileged users cannot record values for future periods."""
        from unittest.mock import AsyncMock, MagicMock
        
        today = date.today()
        future_date = today + timedelta(days=90)
        
        # Create mock KRI
        mock_kri = MagicMock()
        mock_kri.id = 1
        mock_kri.frequency = KRIFrequency.quarterly.value
        mock_kri.current_value = 50.0
        mock_kri.last_period_end = None
        mock_kri.lower_limit = 0.0
        mock_kri.upper_limit = 100.0
        mock_kri.unit = "%"
        
        mock_db = AsyncMock()
        
        # Attempting to record for future period should raise ValueError
        with pytest.raises(ValueError, match="Cannot record a future period"):
            await KRIHistoryService.record_value(
                db=mock_db,
                kri=mock_kri,
                value=75.0,
                period_end=future_date,
                is_privileged=False,
            )
    
    def test_latest_closed_period_excludes_future(self):
        """latest_closed_period_for_date never returns future dates."""
        today = date.today()
        
        for frequency in [
            KRIFrequency.daily.value,
            KRIFrequency.weekly.value,
            KRIFrequency.monthly.value,
            KRIFrequency.quarterly.value,
            KRIFrequency.annually.value,
        ]:
            period_start, period_end = KRIHistoryService.latest_closed_period_for_date(
                today, frequency
            )
            # Latest CLOSED period end should always be <= today
            assert period_end <= today, f"Frequency {frequency}: period_end {period_end} > today {today}"
    
    def test_core_bug_fix_latest_closed_vs_current_period(self):
        """
        CORE BUG FIX TEST: Verify that latest_closed_period != current_period
        when we're in the middle of an open period.
        
        The original bug was: non-privileged users were submitting for current_period_end
        (e.g., Mar 31 on Jan 10), which when approved, set last_period_end to Mar 31
        and masked that Dec 31 was never reported.
        """
        # Simulate Jan 10, 2026 - Q1 2026 is open, Q4 2025 is closed
        jan_10 = date(2026, 1, 10)
        
        # Current period (open) - would be Q1 2026
        _, current_period_end = KRIHistoryService.period_bounds_for_date(
            jan_10, KRIFrequency.quarterly.value
        )
        assert current_period_end == date(2026, 3, 31), "Current period should be Q1 2026"
        
        # Latest CLOSED period - should be Q4 2025
        _, latest_closed_end = KRIHistoryService.latest_closed_period_for_date(
            jan_10, KRIFrequency.quarterly.value
        )
        assert latest_closed_end == date(2025, 12, 31), "Latest closed should be Q4 2025"
        
        # The key assertion: these MUST be different!
        # If they're the same, the bug could still exist
        assert latest_closed_end != current_period_end, (
            "latest_closed_end must differ from current_period_end when in open period"
        )
        assert latest_closed_end < current_period_end, (
            "latest_closed_end must be before current_period_end"
        )
    
    def test_period_bounds_are_calendar_aligned(self):
        """Period boundaries are correctly calendar-aligned."""
        # Test quarterly
        q1_date = date(2026, 2, 15)  # Mid Q1
        start, end = KRIHistoryService.period_bounds_for_date(q1_date, KRIFrequency.quarterly.value)
        assert start == date(2026, 1, 1)
        assert end == date(2026, 3, 31)
        
        # Test monthly
        jan_date = date(2026, 1, 15)
        start, end = KRIHistoryService.period_bounds_for_date(jan_date, KRIFrequency.monthly.value)
        assert start == date(2026, 1, 1)
        assert end == date(2026, 1, 31)
        
        # Test weekly (ISO week - Monday to Sunday)
        wed_date = date(2026, 1, 7)  # Wednesday
        start, end = KRIHistoryService.period_bounds_for_date(wed_date, KRIFrequency.weekly.value)
        assert start.weekday() == 0  # Monday
        assert end.weekday() == 6  # Sunday
        assert (end - start).days == 6
    
    def test_is_period_end_boundary_validates_correctly(self):
        """is_period_end_boundary catches invalid period ends."""
        # Valid period ends
        assert KRIHistoryService.is_period_end_boundary(
            date(2026, 3, 31), KRIFrequency.quarterly.value
        ) is True
        assert KRIHistoryService.is_period_end_boundary(
            date(2026, 1, 31), KRIFrequency.monthly.value
        ) is True
        
        # Invalid - mid-month is not a valid monthly period end
        assert KRIHistoryService.is_period_end_boundary(
            date(2026, 1, 15), KRIFrequency.monthly.value
        ) is False
        # Invalid - mid-quarter is not a valid quarterly period end
        assert KRIHistoryService.is_period_end_boundary(
            date(2026, 2, 28), KRIFrequency.quarterly.value
        ) is False
    
    def test_should_update_current_only_advances_forward(self):
        """last_period_end only updates if new period >= current."""
        # This is the logic from kri_history_service.py:221
        # should_update_current = kri.last_period_end is None or period_end >= kri.last_period_end
        
        # Simulate: KRI already has Q4 2025 reported
        existing_last_period_end = date(2025, 12, 31)
        
        # New submission for Q1 2026 (should update)
        new_period_end_q1_2026 = date(2026, 3, 31)
        should_update = existing_last_period_end is None or new_period_end_q1_2026 >= existing_last_period_end
        assert should_update is True
        
        # Old submission for Q3 2025 (should NOT update)
        old_period_end_q3_2025 = date(2025, 9, 30)
        should_update = existing_last_period_end is None or old_period_end_q3_2025 >= existing_last_period_end
        assert should_update is False
    
    def test_reporting_window_calculation(self):
        """Verify reporting window (15 days after period end)."""
        period_end = date(2026, 3, 31)  # Q1 2026 ends
        due_date = KRIHistoryService.due_date(period_end)
        
        assert due_date == date(2026, 4, 15)  # 15 days grace
        
        # Within window
        on_april_10 = date(2026, 4, 10)
        # Simulate: is_within_reporting_window checks if today <= due_date
        is_within = on_april_10 <= due_date
        assert is_within is True
        
        # Outside window
        on_april_20 = date(2026, 4, 20)
        is_within = on_april_20 <= due_date
        assert is_within is False
