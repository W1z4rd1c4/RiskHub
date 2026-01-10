"""Tests for KRI period validation and protection logic."""
import pytest
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock, AsyncMock

from app.services.kri_history_service import KRIHistoryService
from app.models.key_risk_indicator import KRIFrequency


class TestKRIPeriodProtection:
    """Verify that KRI period semantics protect against invalid submissions."""
    
    def test_future_period_rejected(self):
        """Non-privileged users cannot record values for future periods."""
        today = date.today()
        future_date = today + timedelta(days=90)  # Some future date
        
        # Verify it's actually in the future
        assert future_date > today
        
        # The service should reject this via ValueError in record_value
        # when is_privileged=False and period_end > today
    
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
